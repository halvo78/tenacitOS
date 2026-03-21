import { useState, useEffect, useRef } from 'react';
import { GLTFLoader } from 'three-stdlib';
import type { Group } from 'three';

export function useAvatarModel(agentId: string) {
  const [modelExists, setModelExists] = useState<boolean | null>(null);
  const [model, setModel] = useState<Group | null>(null);
  const modelPath = `/models/${agentId}.glb`;
  const loaderRef = useRef(new GLTFLoader());

  useEffect(() => {
    // Check if model file exists
    fetch(modelPath, { method: 'HEAD' })
      .then(response => {
        setModelExists(response.ok);
      })
      .catch(() => {
        setModelExists(false);
      });
  }, [modelPath]);

  useEffect(() => {
    if (modelExists !== true) return;
    loaderRef.current.load(
      modelPath,
      (gltf) => { setModel(gltf.scene); },
      undefined,
      () => { setModel(null); }
    );
  }, [modelExists, modelPath]);

  return { model, loading: modelExists === null };
}
