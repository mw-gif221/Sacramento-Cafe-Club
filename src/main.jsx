import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Coffee, Heart, Map, Plus, Search, Bookmark, CalendarDays,
  ChevronRight, MapPin, Star, X, Camera, Leaf, Croissant,
  GlassWater, Utensils, BookOpen, Trash2, Clock, ExternalLink
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
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [error, setError] = useState("");
  const [eventError, setEventError] = useState("");

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

  function getNextEventOccurrence(event) {
    if (!event?.event_date) return null;
    const base = new Date(`${event.event_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = event.recurrence_end_date ? new Date(`${event.recurrence_end_date}T00:00:00`) : null;
    const recurrence = event.recurrence || "none";

    if (recurrence === "none") return event.event_date;
    if (end && today > end) return event.event_date;

    let candidate = new Date(base);
    let occurrenceIndex = 0;
    let guard = 0;
    while (candidate < today && guard < 5000) {
      occurrenceIndex += 1;
      if (recurrence === "weekly") {
        candidate = new Date(base);
        candidate.setDate(base.getDate() + occurrenceIndex * 7);
      } else if (recurrence === "biweekly") {
        candidate = new Date(base);
        candidate.setDate(base.getDate() + occurrenceIndex * 14);
      } else if (recurrence === "monthly") {
        const targetMonth = base.getMonth() + occurrenceIndex;
        candidate = new Date(base.getFullYear(), targetMonth, 1);
        const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
        candidate.setDate(Math.min(base.getDate(), lastDay));
      } else if (recurrence === "yearly") {
        candidate = new Date(base);
        candidate.setFullYear(base.getFullYear() + occurrenceIndex);
      } else {
        return event.event_date;
      }
      guard += 1;
    }
    if (end && candidate > end) return null;
    return `${candidate.getFullYear()}-${String(candidate.getMonth()+1).padStart(2,"0")}-${String(candidate.getDate()).padStart(2,"0")}`;
  }

  async function loadEvents() {
    setEventsLoading(true);
    setEventError("");
    const { data, error: eventsQueryError } = await supabase
      .from("events")
      .select("id, title, event_type, event_date, start_time, end_time, location, description, website, instagram, contributor_name, image_url, recurrence, recurrence_end_date, created_at")
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (eventsQueryError) {
      console.error(eventsQueryError);
      setEvents([]);
      setEventError("The event board needs its Supabase table connected. Run the included EVENTS-POLICY.sql once, then refresh.");
      setEventsLoading(false);
      return;
    }

    const normalized = (data || []).map(event => ({
      ...event,
      next_occurrence: getNextEventOccurrence(event)
    })).sort((a, b) => {
      const aTime = new Date(`${a.next_occurrence || a.event_date}T${a.start_time || "23:59"}`).getTime();
      const bTime = new Date(`${b.next_occurrence || b.event_date}T${b.start_time || "23:59"}`).getTime();
      return aTime - bTime;
    });
    setEvents(normalized);
    setEventsLoading(false);
  }

  useEffect(() => {
    loadCafes();
    loadEvents();
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

  async function deleteCafe(cafe) {
    const confirmed = window.confirm(`Delete “${cafe.name}” from the café club? This will remove its reviews, photos, favorites, and map listing for everyone.`);
    if (!confirmed) return false;
    setError("");

    // Remove stored photo files first so deleting the café does not leave orphaned images.
    const photoPaths = (cafe.photos || []).map(photo => {
      try {
        const marker = "/Cafe%20Photos/";
        const encodedPath = photo.photo_url?.split(marker)[1];
        return encodedPath ? decodeURIComponent(encodedPath) : null;
      } catch { return null; }
    }).filter(Boolean);
    if (photoPaths.length) {
      const { error: storageError } = await supabase.storage.from("Cafe Photos").remove(photoPaths);
      if (storageError) console.warn("Photo cleanup failed:", storageError);
    }

    for (const table of ["photos", "reviews", "favorites", "cafe_tags"]) {
      const { error: childError } = await supabase.from(table).delete().eq("cafe_id", cafe.id);
      if (childError) {
        console.error(childError);
        setError(`We couldn't delete ${cafe.name} because its ${table.replace("_", " ")} could not be removed.`);
        return false;
      }
    }

    const { error: cafeDeleteError } = await supabase.from("cafes").delete().eq("id", cafe.id);
    if (cafeDeleteError) {
      console.error(cafeDeleteError);
      setError(cafeDeleteError.message || "We couldn't delete that café. Please try again.");
      return false;
    }

    setSelectedCafe(null);
    await loadCafes();
    return true;
  }

  async function addEvent(form) {
    setEventError("");
    const contributorName = form.contributorName.trim() || "Café Club member";
    const { data: event, error: eventInsertError } = await supabase.from("events").insert({
      title: form.title.trim(),
      event_type: form.eventType,
      event_date: form.eventDate,
      recurrence: form.recurrence || "none",
      recurrence_end_date: form.recurrence !== "none" ? (form.recurrenceEndDate || null) : null,
      start_time: form.startTime || null,
      end_time: form.endTime || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      website: form.website.trim() || null,
      instagram: form.instagram.trim() || null,
      contributor_name: contributorName
    }).select().single();

    if (eventInsertError) {
      console.error(eventInsertError);
      setEventError(eventInsertError.message || "We couldn't post that event. Please try again.");
      return;
    }

    if (form.image) {
      const safeName = form.image.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
      const filePath = `events/${event.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("Cafe Photos").upload(filePath, form.image, {
        cacheControl: "3600", upsert: false, contentType: form.image.type || "image/jpeg"
      });
      if (!uploadError) {
        const { data: publicData } = supabase.storage.from("Cafe Photos").getPublicUrl(filePath);
        await supabase.from("events").update({ image_url: publicData.publicUrl }).eq("id", event.id);
      } else {
        console.error(uploadError);
        setEventError("The event was posted, but its photo could not be uploaded.");
      }
    }

    localStorage.setItem("cafeClubContributor", contributorName);
    setShowAddEvent(false);
    await loadEvents();
    setActiveTab("events");
  }

  async function deleteEvent(event) {
    const confirmed = window.confirm(`Delete “${event.title}” from the community event board?`);
    if (!confirmed) return;
    setEventError("");
    if (event.image_url) {
      try {
        const marker = "/Cafe%20Photos/";
        const encodedPath = event.image_url.split(marker)[1];
        if (encodedPath) await supabase.storage.from("Cafe Photos").remove([decodeURIComponent(encodedPath)]);
      } catch (storageError) { console.warn("Event photo cleanup failed:", storageError); }
    }
    const { error: deleteError } = await supabase.from("events").delete().eq("id", event.id);
    if (deleteError) {
      console.error(deleteError);
      setEventError(deleteError.message || "We couldn't delete that event. Please try again.");
      return;
    }
    setSelectedEvent(null);
    await loadEvents();
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
        ) : activeTab === "events" ? (
          <section className="events-panel">
            <div className="events-hero">
              <div>
                <span className="eyebrow">Café community</span>
                <h2>What’s happening around town? <span>✦</span></h2>
                <p>Share pop-up cafés, coffee tastings, markets, meetups, and other Sacramento community events.</p>
              </div>
              <button className="header-add event-add-button" onClick={() => setShowAddEvent(true)}><Plus size={17}/> Post an event</button>
            </div>
            {eventError && <div className="error-banner event-error">{eventError}</div>}
            {eventsLoading ? (
              <div className="empty-state">Loading the community calendar… ✨</div>
            ) : events.length ? (
              <div className="event-grid">
                {events.map(event => <EventCard key={event.id} event={event} onOpen={setSelectedEvent}/>)}
              </div>
            ) : (
              <div className="events-empty">
                <div className="events-empty-icon">☕</div>
                <h3>No events posted yet</h3>
                <p>Know about a pop-up café or community event? Be the first to add it.</p>
                <button className="submit-button inline-submit" onClick={() => setShowAddEvent(true)}>Post the first event <Plus size={17}/></button>
              </div>
            )}
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

            <section className="section home-events-section" id="events-section">
              <div className="section-heading">
                <div><span className="eyebrow">Café community</span><h2>What’s happening <span>✦</span></h2></div>
                <button className="text-button" onClick={() => setActiveTab("events")}>See all events <ChevronRight size={15}/></button>
              </div>
              {eventsLoading ? (
                <div className="empty-state">Loading community events… ✨</div>
              ) : events.filter(e => {
                const displayDate = e.next_occurrence || e.event_date;
                const when = new Date(`${displayDate}T${e.start_time || "23:59"}`);
                return when >= new Date();
              }).slice(0, 3).length ? (
                <div className="event-grid home-event-grid">
                  {events.filter(e => {
                    const when = new Date(`${e.event_date}T${e.start_time || "23:59"}`);
                    return when >= new Date();
                  }).slice(0, 3).map(event => <EventCard key={event.id} event={event} onOpen={setSelectedEvent}/>)}
                </div>
              ) : (
                <div className="events-home-empty">
                  <div><strong>No upcoming events yet ✦</strong><p>Know about a pop-up café, tasting, market, or community gathering? Share it with the club.</p></div>
                  <button className="submit-button inline-submit" onClick={() => setShowAddEvent(true)}>Post an event <Plus size={16}/></button>
                </div>
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
        <NavButton icon={CalendarDays} label="Events" active={activeTab === "events"} onClick={() => setActiveTab("events")} />
      </nav>

      {showAdd && <AddCafeModal onClose={() => setShowAdd(false)} onSubmit={addCafe}/>}
      {showAddEvent && <AddEventModal onClose={() => setShowAddEvent(false)} onSubmit={addEvent}/>}
      {selectedCafe && <CafeDetailModal cafe={selectedCafe} onClose={() => setSelectedCafe(null)} onUpdate={updateCafe} onDelete={deleteCafe} />}
      {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onDelete={deleteEvent} />}

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

function CafeDetailModal({ cafe, onClose, onUpdate, onDelete }) {
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
          <button className="delete-cafe-button" onClick={() => onDelete?.(cafe)}><Trash2 size={15}/> Delete café</button>
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

function formatRecurrence(value) {
  return ({ weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", yearly: "Yearly" }[value]) || "Repeats";
}

function EventCard({ event, onOpen }) {
  const displayDate = event.next_occurrence || event.event_date;
  const date = displayDate ? new Date(`${displayDate}T00:00:00`) : null;
  const isPast = date ? new Date(`${event.event_date}T${event.start_time || "23:59"}`) < new Date() : false;
  return (
    <article className={`event-card ${isPast ? "past" : ""}`} role="button" tabIndex={0} onClick={() => onOpen?.(event)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(event); } }}>
      <div className="event-date-badge">
        <span>{date?.toLocaleDateString(undefined, { month: "short" }).toUpperCase() || "EVENT"}</span>
        <strong>{date?.toLocaleDateString(undefined, { day: "numeric" }) || "✦"}</strong>
      </div>
      <div className={`event-image ${event.image_url ? "has-image" : ""}`} style={event.image_url ? { backgroundImage: `url(${event.image_url})` } : {}}>
        {!event.image_url && <div className="event-placeholder">☕</div>}
        {isPast && <span className="past-badge">Past event</span>}
      </div>
      <div className="event-info">
        <span className="event-type">{event.event_type || "Community event"}</span>
        {event.recurrence && event.recurrence !== "none" && <span className="event-repeat-pill">↻ {formatRecurrence(event.recurrence)}</span>}
        <h3>{event.title}</h3>
        {event.location && <div className="location"><MapPin size={13}/>{event.location}</div>}
        {event.start_time && <div className="event-time"><Clock size={13}/>{formatEventTime(event.start_time)}{event.end_time ? `–${formatEventTime(event.end_time)}` : ""}</div>}
        {event.description && <p>{event.description}</p>}
        <span className="card-link">View event <ChevronRight size={14}/></span>
      </div>
    </article>
  );
}

function formatEventTime(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes || 0, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function EventDetailModal({ event, onClose, onDelete }) {
  const displayDate = event.next_occurrence || event.event_date;
  const date = displayDate ? new Date(`${displayDate}T00:00:00`) : null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal event-detail-modal" onMouseDown={e => e.stopPropagation()}>
        <div className={`event-detail-image ${event.image_url ? "has-image" : ""}`} style={event.image_url ? { backgroundImage: `url(${event.image_url})` } : {}}>
          {!event.image_url && <div className="event-detail-placeholder">☕ ✦ ☕</div>}
          <button className="detail-close" onClick={onClose} aria-label="Close event"><X size={20}/></button>
        </div>
        <div className="detail-body">
          <span className="eyebrow">Café community</span>
          <h2 className="event-detail-title">{event.title}</h2>
          <div className="event-detail-meta">
            {date && <span><CalendarDays size={14}/>{date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>}
            {event.start_time && <span><Clock size={14}/>{formatEventTime(event.start_time)}{event.end_time ? `–${formatEventTime(event.end_time)}` : ""}</span>}
            {event.location && <span><MapPin size={14}/>{event.location}</span>}
          </div>
          <div className="event-type-pill">{event.event_type || "Community event"}</div>
          {event.recurrence && event.recurrence !== "none" && <div className="event-repeat-detail">↻ Repeats {formatRecurrence(event.recurrence).toLowerCase()}{event.recurrence_end_date ? ` through ${new Date(`${event.recurrence_end_date}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}` : ""}</div>}
          {event.description && <p className="detail-note">{event.description}</p>}
          {(event.website || event.instagram) && <div className="detail-links">
            {event.website && <a href={event.website} target="_blank" rel="noreferrer">Event website <ExternalLink size={13}/></a>}
            {event.instagram && <a href={event.instagram} target="_blank" rel="noreferrer">Instagram <ExternalLink size={13}/></a>}
          </div>}
          <p className="event-posted-by">Posted by {event.contributor_name || "Café Club member"}</p>
          <button className="detail-close-button" onClick={onClose}>Back to events</button>
          <button className="delete-cafe-button" onClick={() => onDelete?.(event)}><Trash2 size={15}/> Delete event</button>
        </div>
      </div>
    </div>
  );
}

function AddEventModal({ onClose, onSubmit }) {
  const savedContributor = localStorage.getItem("cafeClubContributor") || "";
  const [form, setForm] = useState({ title:"", eventType:"Pop-up café", eventDate:"", recurrence:"none", recurrenceEndDate:"", startTime:"", endTime:"", location:"", description:"", website:"", instagram:"", contributorName:savedContributor, image:null });
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  function update(key, value) { setForm(f => ({ ...f, [key]: value })); }
  function handleImage(e) { const file = e.target.files?.[0]; if (!file) return; setPreview(URL.createObjectURL(file)); update("image", file); }
  async function submit(e) { e.preventDefault(); if (!form.title.trim() || !form.eventDate) return; setSaving(true); await onSubmit(form); setSaving(false); }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">Café community</span><h2>Post an event ✦</h2></div><button onClick={onClose} aria-label="Close event form"><X/></button></div>
        <form onSubmit={submit}>
          <label>Event title <input required value={form.title} onChange={e => update("title", e.target.value)} placeholder="e.g. Sunday Coffee Pop-Up"/></label>
          <label>Event type
            <select value={form.eventType} onChange={e => update("eventType", e.target.value)}>
              <option>Pop-up café</option><option>Coffee / food event</option><option>Community event</option><option>Market / makers event</option><option>Other</option>
            </select>
          </label>
          <div className="two-column-fields">
            <label>Date <input required type="date" value={form.eventDate} onChange={e => update("eventDate", e.target.value)}/></label>
            <label>Location <input value={form.location} onChange={e => update("location", e.target.value)} placeholder="e.g. Midtown café"/></label>
          </div>
          <div className="recurrence-box">
            <label>Does this event repeat?
              <select value={form.recurrence} onChange={e => update("recurrence", e.target.value)}>
                <option value="none">No — one-time event</option>
                <option value="weekly">Yes — every week</option>
                <option value="biweekly">Yes — every 2 weeks</option>
                <option value="monthly">Yes — every month</option>
                <option value="yearly">Yes — every year</option>
              </select>
            </label>
            {form.recurrence !== "none" && <label>Repeat through (optional) <input type="date" min={form.eventDate || undefined} value={form.recurrenceEndDate} onChange={e => update("recurrenceEndDate", e.target.value)}/></label>}
            {form.recurrence !== "none" && <p className="field-help">The event stays as one post, and the club will show its next upcoming date.</p>}
          </div>
          <div className="two-column-fields">
            <label>Start time <input type="time" value={form.startTime} onChange={e => update("startTime", e.target.value)}/></label>
            <label>End time <input type="time" value={form.endTime} onChange={e => update("endTime", e.target.value)}/></label>
          </div>
          <label>Your name <input value={form.contributorName} onChange={e => update("contributorName", e.target.value)} placeholder="e.g. Megan"/></label>
          <label>Event details <textarea value={form.description} onChange={e => update("description", e.target.value)} placeholder="Tell the café club what is happening…"/></label>
          <label>Event website <input type="url" value={form.website} onChange={e => update("website", e.target.value)} placeholder="https://…"/></label>
          <label>Instagram <input type="url" value={form.instagram} onChange={e => update("instagram", e.target.value)} placeholder="https://instagram.com/…"/></label>
          <label className="upload"><Camera size={19}/><span>{preview ? "Photo selected" : "Add an event photo (optional)"}</span><input type="file" accept="image/*" onChange={handleImage}/></label>
          {preview && <img className="preview" src={preview} alt="Selected event preview"/>}
          <button className="submit-button" type="submit" disabled={saving}>{saving ? "Posting…" : "Post event"} <CalendarDays size={17}/></button>
        </form>
        <p className="modal-footnote">Event posts are shared with everyone who has the link.</p>
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
        <p className="modal-footnote">Photos are shared with everyone who has the link.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
