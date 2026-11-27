import type { TBotCollection } from '@/services/vindolar/free-bots-schema';

/** Set by the Bot Builder's "Publish bot" button; that list's page opens its add form once. */
let pending: TBotCollection | null = null;

export const requestPublish = (collection: TBotCollection = 'free') => {
    pending = collection;
};

export const consumePendingPublish = (collection: TBotCollection) => {
    if (pending !== collection) return false;
    pending = null;
    return true;
};
