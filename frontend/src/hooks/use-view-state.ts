"use client";

import { useCallback, useState } from "react";

export interface UseViewState {
  currentNodeId: string | null;
  selectedCharacterId: string | null;
  setCurrentNode: (nodeId: string) => void;
  selectCharacter: (id: string, locationId?: string) => void;
  clearSelection: () => void;
  initRootIfNeeded: (rootNodeId: string) => void;
}

export function useViewState(): UseViewState {
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );

  const setCurrentNode = useCallback((nodeId: string) => {
    setCurrentNodeId(nodeId);
  }, []);

  const selectCharacter = useCallback(
    (id: string, locationId?: string) => {
      setSelectedCharacterId(id);
      if (locationId) setCurrentNodeId(locationId);
    },
    [],
  );

  const clearSelection = useCallback(() => setSelectedCharacterId(null), []);

  const initRootIfNeeded = useCallback((rootNodeId: string) => {
    setCurrentNodeId((curr) => curr ?? rootNodeId);
  }, []);

  return {
    currentNodeId,
    selectedCharacterId,
    setCurrentNode,
    selectCharacter,
    clearSelection,
    initRootIfNeeded,
  };
}
