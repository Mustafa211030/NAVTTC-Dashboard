import raw from "../../data/processed/dataset.json";
import type { Dataset } from "../types";

/**
 * The single entry point to the data.
 *
 * This imports the generated file directly from data/processed/ rather than a
 * copy inside src/, so there is exactly one dataset on disk and `npm run data`
 * cannot leave the app reading a stale version.
 */
export const dataset = raw as unknown as Dataset;
export const { rows, institutes, dimensions, categories, components, meta, quality } = dataset;

export const componentByKey = new Map(components.map((c) => [c.key, c]));
export const categoryByKey = new Map(categories.map((c) => [c.key, c]));
export const instituteById = new Map(institutes.map((i) => [i.instituteId, i]));
