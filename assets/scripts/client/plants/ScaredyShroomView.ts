import { ShooterView } from './ShooterView'

/**
 * The scaredy-shroom (ScaredyShroom): it shoots as any shooter does, and hides by the state of its fright, which its
 * animation plays on the server (PlantAnimationDefinition.states). Its own (ScaredyShroom.snapshotOwn): `state`.
 */
export class ScaredyShroomView extends ShooterView {}
