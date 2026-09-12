import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import {
  Coffee, Heart, Map, Plus, Search, Bookmark, UserRound,
  ChevronRight, MapPin, Star, X, Camera, Leaf, Croissant,
  GlassWater, Utensils, BookOpen
} from "lucide-react";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  const [cafes, setCafes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadCafes() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("cafes")
      .select(`
        id, name, address, neighborhood, description, website, instagram,
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

    const { data: cafe, error: cafeError } = await supabase
      .from("cafes")
      .insert({
        name: form.name.trim(),
        address: form.address.trim() || null,
        neighborhood: form.neighborhood.trim() || "Sacramento",
        description: form.review.trim() || null
      })
      .select()
      .single();

    if (cafeError) {
      console.error(cafeError);
      setError(cafeError.message || "We couldn't add that café. Please try again.");
      return;
    }

    if (form.review.trim() || form.rating) {
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

    // Photo uploads are intentionally left for the next step after Storage upload
    // permissions are configured in Supabase.
    localStorage.setItem("cafeClubContributor", contributorName);
    setShowAdd(false);
    await loadCafes();
    setActiveTab("home");
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
            <div className="section-heading">
              <div><span className="eyebrow">Explore</span><h2>Sacramento cafés</h2></div>
              <button className="text-button" onClick={() => setActiveTab("home")}>Back to list</button>
            </div>
            <div className="map-placeholder">
              <div className="map-grid"></div>
              <div className="map-label midtown">MIDTOWN</div>
              <div className="map-label downtown">DOWNTOWN</div>
              <div className="map-label landpark">LAND PARK</div>
              {filtered.map((cafe, i) => (
                <button key={cafe.id} className="map-pin" style={{left: `${20 + ((i * 17) % 62)}%`, top: `${25 + ((i * 23) % 52)}%`}} title={cafe.name}>
                  <Coffee size={16}/>
                </button>
              ))}
              <div className="map-note">Interactive map coming next ✦</div>
            </div>
          </section>
        ) : (
          <>
            <section className="section">
              <div className="section-heading">
                <div><span className="eyebrow">Your collection</span><h2>Favorite cafés <span>♡</span></h2></div>
                <button className="text-button">See all <ChevronRight size={15}/></button>
              </div>
              {loading ? (
                <div className="empty-state">Loading our café club… ☕</div>
              ) : filtered.filter(c => c.favorite).length ? (
                <div className="cafe-grid">
                  {filtered.filter(c => c.favorite).map(cafe => <CafeCard key={cafe.id} cafe={cafe}/>)}
                </div>
              ) : (
                <div className="empty-state">No favorites yet — add a café and make it yours ♡</div>
              )}
            </section>

            <section className="section">
              <div className="section-heading">
                <div><span className="eyebrow">Keep exploring</span><h2>Want to try</h2></div>
                <button className="text-button">See all <ChevronRight size={15}/></button>
              </div>
              {loading ? null : filtered.filter(c => !c.tried).length ? (
                <div className="cafe-grid">
                  {filtered.filter(c => !c.tried).map(cafe => <CafeCard key={cafe.id} cafe={cafe}/>)}
                </div>
              ) : cafes.length ? (
                <div className="empty-state">You've tried every café currently on the list ✨</div>
              ) : (
                <div className="empty-state">Your shared café list is ready for its first find. ☕</div>
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
    </div>
  );
}

function CafeCard({ cafe }) {
  return (
    <article className="cafe-card">
      <div className={`cafe-image ${cafe.image ? "has-image" : ""}`} style={cafe.image ? {backgroundImage: `url(${cafe.image})`} : {}}>
        {!cafe.image && <div className="placeholder-art"><Coffee size={34}/><span>Your photo here</span></div>}
        <button className={`heart ${cafe.favorite ? "liked" : ""}`}><Heart size={18} fill={cafe.favorite ? "currentColor" : "none"}/></button>
      </div>
      <div className="cafe-info">
        <div className="cafe-title-row">
          <h3>{cafe.name}</h3>
          {cafe.rating && <span className="rating"><Star size={14} fill="currentColor"/>{cafe.rating}</span>}
        </div>
        <div className="location"><MapPin size={13}/>{cafe.neighborhood}</div>
        <div className="tags">{cafe.tags.map(t => <span key={t}>{t}</span>)}</div>
        <p>{cafe.note}</p>
      </div>
    </article>
  );
}

function NavButton({icon: Icon, label, active, onClick}) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={19}/><span>{label}</span></button>;
}

function AddCafeModal({onClose, onSubmit}) {
  const savedContributor = localStorage.getItem("cafeClubContributor") || "";
  const [form, setForm] = useState({
    name:"", address:"", neighborhood:"", contributorName:savedContributor,
    rating:"", review:"", tags:["Coffee"], favorite:false, tried:true, image:null
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
            <label className="check"><input type="checkbox" checked={form.tried} onChange={e => update("tried", e.target.checked)}/> I've been here</label>
          </div>
          <button className="submit-button" type="submit" disabled={saving}>{saving ? "Adding…" : "Add café"} <Heart size={17}/></button>
        </form>
        <p className="modal-footnote">Photos will be saved to the shared café album after Storage permissions are connected.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
