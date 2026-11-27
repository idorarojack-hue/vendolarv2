/**
 * Customer reviews for the landing page slider.
 *
 * Only add reviews that real customers gave you (with their permission to show them). While
 * this list is empty, the slider shows the "What's inside Vindolar" tool cards instead.
 *
 * Example entry:
 *     { name: 'Brian K.', country: 'Kenya', rating: 5, text: 'What the customer wrote.' },
 */
export type TReview = {
    /** First name and last initial, or initials only. */
    name: string;
    country?: string;
    /** 1 to 5 stars. */
    rating: number;
    /** The customer's own words. */
    text: string;
};

export const REVIEWS: TReview[] = [];
