import { Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../../shared/game/types';

const beamAxis = new Vector3(0, 0, 1);
const launchDirection = new Vector3();

/** Beam orientation stays on its launch axis; homing adds lateral movement, not visual spin. */
export function orientBeam(rotation: Quaternion, forward: Vec3): void {
  launchDirection.set(forward.x, forward.y, forward.z);
  if (launchDirection.lengthSq() > 1e-12) rotation.setFromUnitVectors(beamAxis, launchDirection.normalize());
}
