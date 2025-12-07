const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDisplayTime = (date: Date) => {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (diffMs < 60 * 1000) return "just now";
  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.floor(diffMs / (60 * 1000));
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (diffMs < dayMs) {
    const hrs = Math.floor(diffMs / (60 * 60 * 1000));
    return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 3 * dayMs) {
    const days = Math.floor(diffMs / dayMs);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return formatDate(date);
};
