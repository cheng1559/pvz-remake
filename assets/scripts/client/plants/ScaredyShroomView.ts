import { ShooterView } from './ShooterView'

/**
 * The scaredy-shroom (ScaredyShroom): it shoots as any shooter does, and hides by the phase of its fright, which its
 * animation plays on the server (PlantAnimationDefinition.phases). Its own (ScaredyShroom.snapshotOwn): `phase`.
 */
export class ScaredyShroomView extends ShooterView {}
