/** Set by the Bot Builder's "Publish to Free Bots" button; the Free Bots page opens its add form once. */
let pending = false;

export const requestPublish = () => {
    pending = true;
};

export const consumePendingPublish = () => {
    const was_pending = pending;
    pending = false;
    return was_pending;
};
