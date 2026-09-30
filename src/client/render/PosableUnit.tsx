import React from 'react';
import type { MechPose } from './types';
import { MechModel } from './MechModel';

export function PosableUnit({ pose, weapon, isDualWielding = false }: {
  pose: MechPose; weapon: 'GUN' | 'SABER'; isDualWielding?: boolean;
}) {
  return <MechModel pose={pose} weapon={weapon} isDualWielding={isDualWielding} />;
}
