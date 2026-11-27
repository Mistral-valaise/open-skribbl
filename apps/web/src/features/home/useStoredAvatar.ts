import type { Avatar } from '@kritzel/shared';
import { useState } from 'react';
import { loadAvatar, saveAvatar } from '../../store/identity.js';

/** The player's avatar; every change is remembered for the next visit (spec 010, AC-010-07). */
export function useStoredAvatar(): [Avatar, (avatar: Avatar) => void] {
  const [avatar, setAvatar] = useState(loadAvatar);
  const change = (next: Avatar) => {
    setAvatar(next);
    saveAvatar(next);
  };
  return [avatar, change];
}
