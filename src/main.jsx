import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Coffee, Heart, Map, Plus, Search, Bookmark, UserRound,
  ChevronRight, MapPin, Star, X, Camera, Leaf, Croissant,
  GlassWater, Utensils, BookOpen
} from "lucide-react";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SACRAMENTO_BOUNDS = {
  south: 37.95,
  north: 39.15,
  west: -122.55,
  east: -120.35
};

function isValidSacramentoCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= SACRAMENTO_BOUNDS.south && lat <= SACRAMENTO_BOUNDS.north
    && lon >= SACRAMENTO_BOUNDS.west && lon <= SACRAMENTO_BOUNDS.east;
}

async function geocodeCafeAddress(address, neighborhood = "Sacramento") {
  if (!address) return null;
  const query = [address, neighborhood, "Sacramento, CA, USA"].filter(Boolean).join(", ");
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`
    );
    if (!response.ok) return null;
    const results = await response.json();
    if (!results?.length) return null;
    const coordinates = { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
    return isValidSacramentoCoordinate(coordinates.latitude, coordinates.longitude) ? coordinates : null;
  } catch (error) {
    console.warn("Map location lookup failed:", error);
    return null;
  }
}

const MAP_CENTER = [38.5816, -121.4944];

function getCafePin(cafe) {
  const tags = cafe.tags || [];
  const pin = tags.includes("Matcha") ? "🍵"
    : tags.includes("Boba") ? "🧋"
    : tags.includes("Pastries") ? "🥐"
    : tags.includes("Brunch") ? "🍳"
    : "☕";

  return L.divIcon({
    className: "cafe-map-marker",
    html: `<div class="cafe-map-marker-inner"><span>${pin}</span></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 44],
    popupAnchor: [0, -43]
  });
}

function MapAutoFit({ cafes }) {
  const map = useMap();
  useEffect(() => {
    const points = cafes
      .filter(c => Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude)))
      .map(c => [Number(c.latitude), Number(c.longitude)]);
    if (points.length === 1) map.setView(points[0], 14);
    if (points.length > 1) map.fitBounds(points, { padding: [70, 70], maxZoom: 14 });
    if (!points.length) map.setView(MAP_CENTER, 12.5);
  }, [cafes, map]);
  return null;
}

function MapCafePopup({ cafe, onOpenCafe }) {
  const map = useMap();
  return (
    <div className="map-popup">
      <div className="map-popup-kicker">Café Club find</div>
      <strong>{cafe.name}</strong>
      <span className="map-popup-location"><MapPin size={12}/>{cafe.neighborhood || "Sacramento"}</span>
      {cafe.rating != null && <span className="map-popup-rating"><Star size={12} fill="currentColor"/>{cafe.rating}</span>}
      {!!cafe.tags?.length && <div className="map-popup-tags">{cafe.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>}
      <button onClick={() => { map.closePopup(); onOpenCafe(cafe); }}>View café <ChevronRight size={14}/></button>
    </div>
  );
}

const categories = [
  { label: "Coffee", icon: Coffee },
  { label: "Matcha", icon: Leaf },
  { label: "Boba", icon: GlassWater },
  { label: "Pastries", icon: Croissant },
  { label: "Brunch", icon: Utensils },
  { label: "Study", icon: BookOpen }
];

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [activeFilter, setActiveFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCafe, setSelectedCafe] = useState(null);
  const [cafes, setCafes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadCafes() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("cafes")
      .select(`
        id, name, address, neighborhood, latitude, longitude, description, website, instagram,
        price_level, created_at,
        reviews ( id, contributor_name, rating, review_text, visit_date ),
        cafe_tags ( tags ( name, emoji ) ),
        photos ( id, contributor_name, photo_url, caption )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError("We couldn't load the café list yet. Please refresh and try again.");
      setLoading(false);
      return;
    }

    const { data: favorites } = await supabase
      .from("favorites")
      .select("cafe_id, contributor_name");

    const favoriteCafeIds = new Set((favorites || []).map((f) => f.cafe_id));

    const normalized = (data || []).map((cafe) => {
      const reviews = cafe.reviews || [];
      const ratings = reviews.map((r) => Number(r.rating)).filter((r) => Number.isFinite(r));
      const average = ratings.length
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;
      const tags = (cafe.cafe_tags || [])
        .map((ct) => ct.tags?.name)
        .filter(Boolean);
      const firstPhoto = cafe.photos?.[0]?.photo_url || null;
      const latestReview = reviews[0]?.review_text || cafe.description || "";

      return {
        ...cafe,
        neighborhood: cafe.neighborhood || "Sacramento",
        rating: average,
        reviews: reviews.length,
        tags,
        image: firstPhoto,
        favorite: favoriteCafeIds.has(cafe.id),
        tried: reviews.length > 0,
        note: latestReview
      };
    });

    setCafes(normalized);
    setLoading(false);
  }

  useEffect(() => {
    loadCafes();
  }, []);

  const filtered = useMemo(() => {
    return cafes.filter((cafe) => {
      const q = query.toLowerCase().trim();
      const matchesQuery =
        !q ||
        cafe.name.toLowerCase().includes(q) ||
        (cafe.neighborhood || "").toLowerCase().includes(q) ||
        (cafe.address || "").toLowerCase().includes(q);
      const matchesFilter =
        activeFilter === "All" || cafe.tags.includes(activeFilter);
      return matchesQuery && matchesFilter;
    });
  }, [cafes, query, activeFilter]);

  async function addCafe(form) {
    setError("");

    const contributorName = form.contributorName.trim() || "Café Club member";
    const address = form.address.trim() || null;
    const neighborhood = form.neighborhood.trim() || "Sacramento";
    const coordinates = await geocodeCafeAddress(address, neighborhood);

    const { data: cafe, error: cafeError } = await supabase
      .from("cafes")
      .insert({
        name: form.name.trim(),
        address,
        neighborhood,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        description: form.review.trim() || null
      })
      .select()
      .single();

    if (cafeError) {
      console.error(cafeError);
      setError(cafeError.message || "We couldn't add that café. Please try again.");
      return;
    }

    if (!form.wantToTry && (form.review.trim() || form.rating)) {
      const { error: reviewError } = await supabase.from("reviews").insert({
        cafe_id: cafe.id,
        contributor_name: contributorName,
        rating: form.rating ? Number(form.rating) : null,
        review_text: form.review.trim() || null
      });
      if (reviewError) console.error(reviewError);
    }

    const selectedTags = form.tags.length ? form.tags : ["Coffee"];
    const { data: tagRows, error: tagError } = await supabase
      .from("tags")
      .select("id, name")
      .in("name", selectedTags);
    if (tagError) console.error(tagError);

    if (tagRows?.length) {
      const { error: cafeTagsError } = await supabase.from("cafe_tags").insert(
        tagRows.map((tag) => ({ cafe_id: cafe.id, tag_id: tag.id }))
      );
      if (cafeTagsError) console.error(cafeTagsError);
    }

    if (form.favorite) {
      const { error: favoriteError } = await supabase.from("favorites").insert({
        cafe_id: cafe.id,
        contributor_name: contributorName
      });
      if (favoriteError) console.error(favoriteError);
    }

    // Upload the selected photo to the public Supabase Storage bucket.
    if (form.image) {
      const file = form.image;
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
      const filePath = `${cafe.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase
        .storage
        .from("Cafe Photos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg"
        });

      if (uploadError) {
        console.error(uploadError);
        setError("The café was added, but the photo could not be uploaded yet. Please check Storage permissions.");
      } else {
        const { data: publicData } = supabase
          .storage
          .from("Cafe Photos")
          .getPublicUrl(filePath);

        const { error: photoRowError } = await supabase.from("photos").insert({
          cafe_id: cafe.id,
          contributor_name: contributorName,
          photo_url: publicData.publicUrl
        });

        if (photoRowError) console.error(photoRowError);
      }
    }

    localStorage.setItem("cafeClubContributor", contributorName);
    setShowAdd(false);
    await loadCafes();
    setActiveTab("home");
  }

  async function updateCafe(cafeId, form) {
    setError("");

    const address = form.address.trim() || null;
    const neighborhood = form.neighborhood.trim() || "Sacramento";
    const coordinates = await geocodeCafeAddress(address, neighborhood);

    const { error: cafeError } = await supabase
      .from("cafes")
      .update({
        name: form.name.trim(),
        address,
        neighborhood,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        description: form.description.trim() || null
      })
      .eq("id", cafeId);

    if (cafeError) {
      console.error(cafeError);
      setError(cafeError.message || "We couldn't update that café. Please try again.");
      return false;
    }

    // Replace the café's tag associations with the edited selection.
    const { error: tagDeleteError } = await supabase
      .from("cafe_tags")
      .delete()
      .eq("cafe_id", cafeId);
    if (tagDeleteError) {
      console.error(tagDeleteError);
      setError(tagDeleteError.message || "The café was updated, but its tags could not be changed.");
      await loadCafes();
      return false;
    }

    const selectedTags = form.tags.length ? form.tags : ["Coffee"];
    const { data: tagRows, error: tagError } = await supabase
      .from("tags")
      .select("id, name")
      .in("name", selectedTags);
    if (tagError) {
      console.error(tagError);
      setError(tagError.message || "The café was updated, but its tags could not be loaded.");
      await loadCafes();
      return false;
    }

    if (tagRows?.length) {
      const { error: cafeTagsError } = await supabase.from("cafe_tags").insert(
        tagRows.map((tag) => ({ cafe_id: cafeId, tag_id: tag.id }))
      );
      if (cafeTagsError) {
        console.error(cafeTagsError);
        setError(cafeTagsError.message || "The café was updated, but its tags could not be saved.");
        await loadCafes();
        return false;
      }
    }

    await loadCafes();
    setSelectedCafe(null);
    return true;
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Coffee size={20} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">Sacramento Café Club <span>♡</span></div>
            <div className="brand-tagline">good coffee. brighter days.</div>
          </div>
        </div>
        <button className="header-add" onClick={() => setShowAdd(true)}>
          <Plus size={18} /> <span>Add a café</span>
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">☕ Sacramento, California</span>
            <h1>Our little guide to <em>great cafés.</em></h1>
            <p>Save your favorites, share your finds, and keep track of every coffee, matcha & pastry adventure.</p>
          </div>
          <div className="hero-doodle">♡</div>
        </section>

        <div className="search-row">
          <div className="search-box">
            <Search size={19} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cafés or neighborhoods..."
            />
            {query && <button className="clear" onClick={() => setQuery("")}><X size={16}/></button>}
          </div>
          <button className="map-button" onClick={() => setActiveTab("map")}>
            <Map size={18} /> <span>Map</span>
          </button>
        </div>

        <div className="category-scroller">
          <button className={`category-chip ${activeFilter === "All" ? "selected" : ""}`} onClick={() => setActiveFilter("All")}>All</button>
          {categories.map(({label, icon: Icon}) => (
            <button
              key={label}
              className={`category-chip ${activeFilter === label ? "selected" : ""}`}
              onClick={() => setActiveFilter(label)}
            >
              <Icon size={16}/>{label}
            </button>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {activeTab === "map" ? (
          <section className="map-panel">
            <div className="map-heading">
              <div>
                <span className="eyebrow">Explore Sacramento</span>
                <h2>Find your next café <span>☕</span></h2>
                <p>Tap a pin to peek at a café, then open its full club page.</p>
              </div>
              <button className="text-button" onClick={() => setActiveTab("home")}>Back to list</button>
            </div>
            <CafeMap cafes={filtered} onOpenCafe={setSelectedCafe} />
          </section>
        ) : (
          <>
            <section className="section" id="favorite-section">
              <div className="section-heading">
                <div><span className="eyebrow">Your collection</span><h2>Favorite cafés <span>♡</span></h2></div>
                <button className="text-button" onClick={() => document.getElementById("favorite-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}>See all <ChevronRight size={15}/></button>
              </div>
              {loading ? (
                <div className="empty-state">Loading our café club… ☕</div>
              ) : filtered.filter(c => c.favorite).length ? (
                <div className="cafe-grid">
                  {filtered.filter(c => c.favorite).map(cafe => <CafeCard key={cafe.id} cafe={cafe} onOpen={setSelectedCafe}/>)}
                </div>
              ) : (
                <div className="empty-state">No favorites yet — add a café and make it yours ♡</div>
              )}
            </section>

            <section className="section" id="want-to-try-section">
              <div className="section-heading">
                <div><span className="eyebrow">Keep exploring</span><h2>Want to try</h2></div>
                <button className="text-button" onClick={() => document.getElementById("want-to-try-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}>See all <ChevronRight size={15}/></button>
              </div>
              {loading ? null : filtered.filter(c => !c.tried).length ? (
                <div className="cafe-grid">
                  {filtered.filter(c => !c.tried).map(cafe => <CafeCard key={cafe.id} cafe={cafe} onOpen={setSelectedCafe}/>)}
                </div>
              ) : cafes.length ? (
                <div className="empty-state">You've tried every café currently on the list ✨</div>
              ) : (
                <div className="empty-state">Your shared café list is ready for its first find. ☕</div>
              )}
            </section>

            <section className="section" id="all-cafes-section">
              <div className="section-heading">
                <div><span className="eyebrow">The café club</span><h2>All cafés ☕</h2></div>
                <span className="cafe-count">{filtered.length} {filtered.length === 1 ? "café" : "cafés"}</span>
              </div>
              {loading ? (
                <div className="empty-state">Loading our café club… ☕</div>
              ) : filtered.length ? (
                <div className="cafe-grid">
                  {filtered.map(cafe => <CafeCard key={cafe.id} cafe={cafe} onOpen={setSelectedCafe}/>)}
                </div>
              ) : (
                <div className="empty-state">No cafés match your search or filter yet. Try another one ♡</div>
              )}
            </section>

            <section className="community-banner">
              <div className="community-icon">☕</div>
              <div>
                <span className="eyebrow">Café crew</span>
                <h3>Found a cute spot?</h3>
                <p>Anyone with the link can add a café, review, or photo.</p>
              </div>
              <button onClick={() => setShowAdd(true)}>Add yours <Plus size={16}/></button>
            </section>
          </>
        )}
      </main>

      <nav className="bottom-nav">
        <NavButton icon={Coffee} label="Home" active={activeTab === "home"} onClick={() => setActiveTab("home")} />
        <NavButton icon={Map} label="Map" active={activeTab === "map"} onClick={() => setActiveTab("map")} />
        <button className="floating-add" onClick={() => setShowAdd(true)} aria-label="Add café"><Plus size={26}/></button>
        <NavButton icon={Bookmark} label="Saved" active={false} onClick={() => {}} />
        <NavButton icon={UserRound} label="Crew" active={false} onClick={() => {}} />
      </nav>

      {showAdd && <AddCafeModal onClose={() => setShowAdd(false)} onSubmit={addCafe}/>}
      {selectedCafe && <CafeDetailModal cafe={selectedCafe} onClose={() => setSelectedCafe(null)} onUpdate={updateCafe} />}

    </div>
  );
}

function CafeMap({ cafes, onOpenCafe }) {
  const [mapCafes, setMapCafes] = useState(cafes);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function prepareLocations() {
      setMapCafes(cafes);
      const missing = cafes.filter(c => c.address && !isValidSacramentoCoordinate(c.latitude, c.longitude));
      if (!missing.length) return;

      setGeocoding(true);
      const resolved = new Map();
      for (const cafe of missing) {
        if (cancelled) return;
        const coordinates = await geocodeCafeAddress(cafe.address, cafe.neighborhood);
        if (coordinates) {
          resolved.set(cafe.id, coordinates);
          await supabase.from("cafes").update(coordinates).eq("id", cafe.id);
        } else if (cafe.latitude != null || cafe.longitude != null) {
          await supabase.from("cafes").update({ latitude: null, longitude: null }).eq("id", cafe.id);
        }
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
      if (cancelled) return;
      setMapCafes(cafes.map(c => resolved.has(c.id) ? { ...c, ...resolved.get(c.id) } : c));
      setGeocoding(false);
    }
    prepareLocations();
    return () => { cancelled = true; };
  }, [cafes]);

  const located = mapCafes.filter(c => isValidSacramentoCoordinate(c.latitude, c.longitude));
  const mappedTags = [...new Set(located.flatMap(c => c.tags || []))];
  const hasMatcha = mappedTags.includes("Matcha");
  const hasBoba = mappedTags.includes("Boba");
  const hasPastries = mappedTags.includes("Pastries");

  return (
    <div className="map-shell">
      <MapContainer center={MAP_CENTER} zoom={12} scrollWheelZoom={true} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapAutoFit cafes={located} />
        {located.map(cafe => (
          <Marker key={cafe.id} position={[Number(cafe.latitude), Number(cafe.longitude)]} icon={getCafePin(cafe)}>
            <Popup className="cafe-map-popup">
              <MapCafePopup cafe={cafe} onOpenCafe={onOpenCafe} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="map-floating-label">
        <span>☕</span> Sacramento Café Club
      </div>
      <div className="map-legend">
        <span><b>☕</b> Coffee</span>
        {hasMatcha && <span><b>🍵</b> Matcha</span>}
        {hasBoba && <span><b>🧋</b> Boba</span>}
        {hasPastries && <span><b>🥐</b> Pastries</span>}
      </div>
      {geocoding && <div className="map-status">Finding café locations… ✦</div>}
      {!geocoding && !located.length && <div className="map-status">Add an address to a café to place it on the map ♡</div>}
      {!geocoding && located.length < mapCafes.length && located.length > 0 && (
        <div className="map-status map-status-bottom">{located.length} of {mapCafes.length} cafés mapped</div>
      )}
    </div>
  );
}

function CafeCard({ cafe, onOpen }) {
  function handleOpen() { onOpen?.(cafe); }
  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpen(); }
  }

  return (
    <article className="cafe-card" role="button" tabIndex={0} onClick={handleOpen} onKeyDown={handleKeyDown} aria-label={`View ${cafe.name}`}>
      <div className={`cafe-image ${cafe.image ? "has-image" : ""}`} style={cafe.image ? {backgroundImage: `url(${cafe.image})`} : {}}>
        {!cafe.image && <div className="placeholder-art"><Coffee size={34}/><span>Your photo here</span></div>}
        <button className={`heart ${cafe.favorite ? "liked" : ""}`} onClick={(e) => e.stopPropagation()} aria-label="Favorite café">
          <Heart size={18} fill={cafe.favorite ? "currentColor" : "none"}/>
        </button>
      </div>
      <div className="cafe-info">
        <div className="cafe-title-row">
          <h3>{cafe.name}</h3>
          {cafe.rating != null && <span className="rating"><Star size={14} fill="currentColor"/>{cafe.rating}</span>}
        </div>
        <div className="location"><MapPin size={13}/>{cafe.neighborhood}</div>
        <div className="tags">{cafe.tags.map(t => <span key={t}>{t}</span>)}</div>
        {cafe.note && <p>{cafe.note}</p>}
        <span className="card-link">View café <ChevronRight size={14}/></span>
      </div>
    </article>
  );
}

function CafeDetailModal({ cafe, onClose, onUpdate }) {
  const reviews = cafe.reviews || [];
  const photos = cafe.photos || [];
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal cafe-detail-modal" onMouseDown={e => e.stopPropagation()}>
        <div className={`detail-image ${cafe.image ? "has-image" : ""}`} style={cafe.image ? { backgroundImage: `url(${cafe.image})` } : {}}>
          {!cafe.image && <div className="placeholder-art"><Coffee size={42}/><span>Your café photo here</span></div>}
          <button className="detail-close" onClick={onClose} aria-label="Close café details"><X size={20}/></button>
        </div>
        <div className="detail-body">
          <span className="eyebrow">Café club find</span>
          <div className="detail-title-row">
            <div>
              <h2>{cafe.name}</h2>
              <div className="location"><MapPin size={14}/>{cafe.address || cafe.neighborhood}</div>
            </div>
            {cafe.rating != null && <div className="detail-rating"><Star size={16} fill="currentColor"/>{cafe.rating}</div>}
          </div>
          {!!cafe.tags.length && <div className="tags detail-tags">{cafe.tags.map(t => <span key={t}>{t}</span>)}</div>}
          <div className="detail-meta">
            {cafe.tried && <span>✓ Visited</span>}
            {cafe.favorite && <span>♡ Favorite</span>}
            <span>{reviews.length} {reviews.length === 1 ? "review" : "reviews"}</span>
          </div>
          <button className="edit-cafe-button" onClick={() => setShowEdit(true)}>
            Edit café <span>✎</span>
          </button>
          {cafe.note && <p className="detail-note">{cafe.note}</p>}
          {(cafe.website || cafe.instagram) && (
            <div className="detail-links">
              {cafe.website && <a href={cafe.website} target="_blank" rel="noreferrer">Website <ChevronRight size={14}/></a>}
              {cafe.instagram && <a href={cafe.instagram} target="_blank" rel="noreferrer">Instagram <ChevronRight size={14}/></a>}
            </div>
          )}
          {photos.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-heading"><h3>Café photos</h3><span>{photos.length}</span></div>
              <div className="photo-strip">
                {photos.map(photo => (
                  <figure key={photo.id} className="photo-thumb" onClick={() => setSelectedPhoto(photo)} tabIndex={0} role="button" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedPhoto(photo); } }} aria-label={`Expand photo of ${cafe.name}`}>
                    <img src={photo.photo_url} alt={photo.caption || `${cafe.name} café`} />
                    {photo.caption && <figcaption>{photo.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          )}
          <div className="detail-section">
            <div className="detail-section-heading"><h3>Community reviews</h3><span>{reviews.length}</span></div>
            {reviews.length ? (
              <div className="review-list">
                {reviews.map(review => (
                  <div className="review-item" key={review.id}>
                    <div className="review-top"><strong>{review.contributor_name || "Café Club member"}</strong>{review.rating != null && <span><Star size={12} fill="currentColor"/>{review.rating}</span>}</div>
                    {review.review_text && <p>{review.review_text}</p>}
                    {review.visit_date && <small>Visited {new Date(`${review.visit_date}T00:00:00`).toLocaleDateString()}</small>}
                  </div>
                ))}
              </div>
            ) : <div className="detail-empty">No reviews yet — be the first to share a note. ♡</div>}
          </div>
          <button className="detail-close-button" onClick={onClose}>Back to cafés</button>
        </div>
        {selectedPhoto && (
          <div className="photo-lightbox" onMouseDown={() => setSelectedPhoto(null)}>
            <div className="photo-lightbox-inner" onMouseDown={e => e.stopPropagation()}>
              <button className="photo-lightbox-close" onClick={() => setSelectedPhoto(null)} aria-label="Close photo"><X size={22}/></button>
              <img src={selectedPhoto.photo_url} alt={selectedPhoto.caption || `${cafe.name} café`} />
              {selectedPhoto.caption && <p>{selectedPhoto.caption}</p>}
            </div>
          </div>
        )}
        {showEdit && (
          <EditCafeModal
            cafe={cafe}
            onClose={() => setShowEdit(false)}
            onSave={async (form) => {
              const ok = await onUpdate(cafe.id, form);
              if (ok) setShowEdit(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function EditCafeModal({ cafe, onClose, onSave }) {
  const [form, setForm] = useState({
    name: cafe.name || "",
    address: cafe.address || "",
    neighborhood: cafe.neighborhood || "",
    description: cafe.description || cafe.note || "",
    tags: cafe.tags?.length ? cafe.tags : ["Coffee"]
  });
  const [saving, setSaving] = useState(false);

  function update(key, value) { setForm(f => ({ ...f, [key]: value })); }
  function toggleTag(tag) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
    }));
  }
  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop edit-modal-backdrop" onMouseDown={onClose}>
      <div className="modal edit-cafe-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">Café club</span><h2>Edit café ✎</h2></div>
          <button onClick={onClose} aria-label="Close edit café"><X/></button>
        </div>
        <form onSubmit={submit}>
          <label>Café name <input required value={form.name} onChange={e => update("name", e.target.value)} /></label>
          <label>Address <input value={form.address} onChange={e => update("address", e.target.value)} placeholder="e.g. 1100 R St, Sacramento" /></label>
          <label>Neighborhood <input value={form.neighborhood} onChange={e => update("neighborhood", e.target.value)} placeholder="e.g. Midtown" /></label>
          <label>Café description <textarea value={form.description} onChange={e => update("description", e.target.value)} placeholder="A short note about this café" /></label>
          <div className="field-label">Tags</div>
          <div className="tag-picker">
            {categories.map(({label, icon:Icon}) => (
              <button type="button" key={label} className={form.tags.includes(label) ? "tag-on" : ""} onClick={() => toggleTag(label)}>
                <Icon size={15}/>{label}
              </button>
            ))}
          </div>
          <button className="submit-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"} <Heart size={17}/>
          </button>
        </form>
        <p className="modal-footnote">Café details are shared with everyone who has the link.</p>
      </div>
    </div>
  );
}

function NavButton({icon: Icon, label, active, onClick}) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={19}/><span>{label}</span></button>;
}

function AddCafeModal({onClose, onSubmit}) {
  const savedContributor = localStorage.getItem("cafeClubContributor") || "";
  const [form, setForm] = useState({
    name:"", address:"", neighborhood:"", contributorName:savedContributor,
    rating:"", review:"", tags:["Coffee"], favorite:false, tried:true, wantToTry:false, image:null
  });
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);

  function update(key, value) { setForm(f => ({...f, [key]: value})); }
  function toggleTag(tag) { setForm(f => ({...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]})); }
  function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    update("image", file);
  }
  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">Café crew</span><h2>Add a café ♡</h2></div><button onClick={onClose}><X/></button></div>
        <form onSubmit={submit}>
          <label>Café name <input required value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. Camellia Coffee"/></label>
          <label>Your name <input value={form.contributorName} onChange={e => update("contributorName", e.target.value)} placeholder="e.g. Megan"/></label>
          <label>Address <input value={form.address} onChange={e => update("address", e.target.value)} placeholder="e.g. 1100 R St, Sacramento"/></label>
          <label>Neighborhood <input value={form.neighborhood} onChange={e => update("neighborhood", e.target.value)} placeholder="e.g. Midtown"/></label>
          <label>Your rating <input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={e => update("rating", e.target.value)} placeholder="4.5"/></label>
          <label>Your review <textarea value={form.review} onChange={e => update("review", e.target.value)} placeholder="What did you love? What should we order?"/></label>
          <div className="field-label">Tags</div>
          <div className="tag-picker">{categories.map(({label,icon:Icon}) => <button type="button" key={label} className={form.tags.includes(label) ? "tag-on" : ""} onClick={() => toggleTag(label)}><Icon size={15}/>{label}</button>)}</div>
          <label className="upload">
            <Camera size={19}/>
            <span>{preview ? "Photo selected" : "Add a café photo"}</span>
            <input type="file" accept="image/*" onChange={handleImage}/>
          </label>
          {preview && <img className="preview" src={preview} alt="Selected café preview"/>}
          <div className="switch-row">
            <label className="check"><input type="checkbox" checked={form.favorite} onChange={e => update("favorite", e.target.checked)}/> Favorite</label>
            <label className="check"><input type="checkbox" checked={form.tried} onChange={e => setForm(f => ({...f, tried: e.target.checked, wantToTry: e.target.checked ? false : f.wantToTry}))}/> I've been here</label>
            <label className="check"><input type="checkbox" checked={form.wantToTry} onChange={e => setForm(f => ({...f, wantToTry: e.target.checked, tried: e.target.checked ? false : f.tried}))}/> Want to try</label>
          </div>
          <button className="submit-button" type="submit" disabled={saving}>{saving ? "Adding…" : "Add café"} <Heart size={17}/></button>
        </form>
        <p className="modal-footnote">Photos will be saved to the shared café album after Storage permissions are connected.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
