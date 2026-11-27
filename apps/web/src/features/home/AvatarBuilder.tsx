import type { Avatar as AvatarParts } from '@kritzel/shared';
import { ChevronLeft, ChevronRight, Dices } from 'lucide-react';
import { t } from '../../i18n/index.js';
import { Avatar } from '../../ui/Avatar.js';
import {
  AVATAR_PART_NAMES,
  differentRandomAvatar,
  stepAvatarPart,
} from '../../ui/avatarBuilder.js';
import { IconButton, ICON } from '../../ui/IconButton.js';

interface AvatarBuilderProps {
  avatar: AvatarParts;
  /** The nickname typed so far, for the avatar's alternative text. */
  name: string;
  onChange: (avatar: AvatarParts) => void;
}

/** The avatar with its dice button (spec 010). */
export function AvatarPreview({ avatar, name, onChange }: AvatarBuilderProps) {
  return (
    <div className="relative shrink-0">
      <Avatar avatar={avatar} name={name} size={96} className="shadow-md" />
      <IconButton
        data-testid="avatar-random"
        label={t('avatar.random')}
        icon={<Dices {...ICON} />}
        className="absolute -right-2 -bottom-2 rounded-full border border-line bg-surface-overlay shadow-sm hover:bg-surface-hover"
        onClick={() => onChange(differentRandomAvatar(avatar, Math.random))}
      />
    </div>
  );
}

/** Previous and next for each of the four parts (spec 010, AC-010-06). */
export function AvatarPartControls({ avatar, onChange }: Omit<AvatarBuilderProps, 'name'>) {
  return (
    <div role="group" aria-label={t('avatar.builder')} className="grid grid-cols-2 gap-2">
      {AVATAR_PART_NAMES.map((part) => (
        <div
          key={part}
          className="flex items-center justify-between rounded-md border border-line bg-surface-overlay"
        >
          <IconButton
            data-testid={`avatar-prev-${part}`}
            label={t(`avatar.prev.${part}`)}
            icon={<ChevronLeft {...ICON} />}
            onClick={() => onChange(stepAvatarPart(avatar, part, -1))}
          />
          <span aria-hidden className="min-w-0 truncate text-caption text-fg-secondary">
            {t(`avatar.part.${part}`)}
          </span>
          <IconButton
            data-testid={`avatar-next-${part}`}
            label={t(`avatar.next.${part}`)}
            icon={<ChevronRight {...ICON} />}
            onClick={() => onChange(stepAvatarPart(avatar, part, 1))}
          />
        </div>
      ))}
    </div>
  );
}
