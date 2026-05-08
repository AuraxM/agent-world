"use client";

import { useCallback, useState } from "react";

export function useFollow() {
  const [followingId, setFollowingId] = useState<string | null>(null);

  const follow = useCallback((id: string) => setFollowingId(id), []);
  const clear = useCallback(() => setFollowingId(null), []);
  const isFollowing = useCallback(
    (id: string) => followingId === id,
    [followingId],
  );

  return { followingId, follow, clear, isFollowing };
}
