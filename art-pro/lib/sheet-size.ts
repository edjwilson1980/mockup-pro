/** The physical film on the roll. */
export const FILM_WIDTH_IN = 24

/**
 * Standard gang sheet width for every sheet Art Pro builds: 22.3 in, the
 * same as the southside-dtf builder. The cutter math (mark gap, clear span,
 * two-up limit) derives from this one number; it is the width the Teneth
 * cutter was proven at. Run a physical cutter test sheet before changing it.
 */
export const SHEET_WIDTH_IN = 22.3

/** Unprintable film either side of the printable width. */
export const FILM_EDGE_IN = (FILM_WIDTH_IN - SHEET_WIDTH_IN) / 2

/** Print resolution for every output file. */
export const DPI = 300

/** Most artwork on one sheet; past this the job starts sheet 2 (N of M). */
export const MAX_SHEET_LENGTH_IN = 200
