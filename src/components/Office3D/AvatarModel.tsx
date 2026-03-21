'use client';

import { Sphere } from '@react-three/drei';
import type { AgentConfig } from './agentsConfig';
import { useEffect, useState, useRef } from 'react';
import type { Group } from 'three';
import { GLTFLoader } from 'three-stdlib';

interface AvatarModelProps {
  agent: AgentConfig;
  position: [number, number, number];
}

// Inner component that loads via imperative GLTFLoader (no hooks, no conditional calls)
function LoadedAvatar({ modelPath, position, color }: { modelPath: string; position: [number, number, number]; color: string }) {
  const [scene, setScene] = useState<Group | null>(null);
  const loaderRef = useRef(new GLTFLoader());

  useEffect(() => {
    let cancelled = false;
    loaderRef.current.load(
      modelPath,
      (gltf) => { if (!cancelled) setScene(gltf.scene); },
      undefined,
      () => { if (!cancelled) setScene(null); }
    );
    return () => { cancelled = true; };
  }, [modelPath]);

  if (!scene) {
    return (
      <Sphere args={[0.3, 16, 16]} position={position} castShadow>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </Sphere>
    );
  }

  return (
    <primitive
      object={scene.clone()}
      position={position}
      scale={0.8}
      rotation={[0, Math.PI, 0]}
      castShadow
      receiveShadow
    />
  );
}

export default function AvatarModel({ agent, position }: AvatarModelProps) {
  const modelPath = `/models/${agent.id}.glb`;
  const [exists, setExists] = useState<boolean>(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    fetch(modelPath, { method: 'HEAD' })
      .then(res => setExists(res.ok))
      .catch(() => setExists(false));
  }, [modelPath]);

  if (!exists) {
    return (
      <Sphere args={[0.3, 16, 16]} position={position} castShadow>
        <meshStandardMaterial
          color={agent.color}
          emissive={agent.color}
          emissiveIntensity={0.3}
        />
      </Sphere>
    );
  }

  return <LoadedAvatar modelPath={modelPath} position={position} color={agent.color} />;
}
