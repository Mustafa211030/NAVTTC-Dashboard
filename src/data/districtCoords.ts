/**
 * Approximate district-seat coordinates for every district in the dataset.
 *
 * The map's province outlines come from Natural Earth (10m admin-1). District
 * polygons are not available at that resolution, so districts are plotted as
 * scaled bubbles at their administrative seat instead. That is arguably the
 * better reading anyway: bubble area carries the measure, and a bubble cannot
 * imply a boundary the data does not actually resolve to.
 *
 * Keys are matched case-insensitively against `District Name` in the workbook,
 * so "LAYYAH" and "Layyah" both resolve. If a future file introduces a district
 * that is not listed here, the map reports it as unplaced rather than dropping
 * it — see the coverage note on the Geography page.
 *
 * These are seat coordinates, accurate to roughly a kilometre. Correct any of
 * them here and the map updates; nothing else reads this file.
 */
export const DISTRICT_COORDS: Record<string, [number, number]> = {
  // Punjab
  bahawalnagar: [73.2536, 29.9937],
  bahawalpur: [71.6836, 29.3956],
  "dera ghazi khan": [70.6403, 30.0489],
  khanewal: [71.9321, 30.3017],
  "kot addu": [70.9644, 30.4695],
  layyah: [70.9406, 30.9612],
  lodhran: [71.6335, 29.5467],
  multan: [71.4753, 30.1984],
  muzaffargarh: [71.1933, 30.0736],
  "rahimyar khan": [70.2989, 28.4202],
  "rajan pur": [70.3302, 29.1041],
  rajanpur: [70.3302, 29.1041],
  vehari: [72.3489, 30.0445],

  // Islamabad Capital Territory
  islamabad: [73.0479, 33.6844],

  // Azad Jammu & Kashmir
  bagh: [73.7743, 33.9793],
  hattian: [73.7616, 34.1614],
  haveli: [74.0800, 33.7700],
  kotli: [73.9020, 33.5180],
  mirpur: [73.7510, 33.1478],
  muzaffarabad: [73.4711, 34.3700],
  rawalakot: [73.7604, 33.8578],

  // Gilgit-Baltistan
  astore: [74.8600, 35.3670],
  ghanche: [76.3000, 35.3000],
  ghizer: [73.4500, 36.1700],
  gilgit: [74.3080, 35.9200],
  hunza: [74.6500, 36.3200],
  skardu: [75.6333, 35.2971],
};

/** Normalises a workbook district string to a lookup key. */
export const districtKey = (name: string): string => name.replace(/\s+/g, " ").trim().toLowerCase();

export function coordsFor(name: string): [number, number] | null {
  return DISTRICT_COORDS[districtKey(name)] ?? null;
}
