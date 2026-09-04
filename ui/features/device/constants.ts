export const storeSlots = Array.from({ length: 36 }, (_, index) => `U${Math.floor(index / 4) + 1}-${(index % 4) + 1}`);
