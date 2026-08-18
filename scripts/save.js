const STORAGE_KEY = "prism-paddock";
const WD = window.Wavedash;
const FILE = "save.json";

// On Wavedash the save lives in the player's Remote Storage. Cloud I/O is
// async, so we mirror it in a synchronous in-memory cache: reads hit the cache,
// writes update it and schedule a debounced upload. Off-platform we keep the
// plain localStorage path.
let cache, uploadT;

export function save(state) {
  const j = JSON.stringify(state);
  if (!WD) return (localStorage[STORAGE_KEY] = j);
  cache = state;
  clearTimeout(uploadT);
  // Coalesce bursts of state changes into a single cloud write.
  uploadT = setTimeout(async () => {
    await WD.writeLocalFile(FILE, new TextEncoder().encode(j));
    WD.uploadRemoteFile(FILE);
  }, 1000);
}

export function load() {
  if (WD) return cache;
  try {
    return JSON.parse(localStorage[STORAGE_KEY]);
  } catch {}
}

// Pull the cloud save into the cache once, before the store is initialized.
// A no-op (and instant) when not running on Wavedash.
export async function hydrate() {
  if (WD && (await WD.downloadRemoteFile(FILE)).success)
    try {
      cache = JSON.parse(
        new TextDecoder().decode(await WD.readLocalFile(FILE)),
      );
    } catch {}
}
