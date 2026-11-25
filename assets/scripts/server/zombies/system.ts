import { moveZombie, playZombie, stepZombie, walkZombie, zombieBody } from './animation'
import { passedMark } from '@/shared/content/animation'
import { squashed } from '@/shared/content/zombieAnimation'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameSystem, SystemContext, World } from '@/server/state/World'
import { type GameplayDefinitions, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import { damageZombie, startZombieDeath, updateHeadlessZombie } from './damage'
import { zombiePartDropped } from './parts'
import { LevelStateResource, RandomResource } from '../state/resources'
import type { Plant } from '../plants/Plant'
import type { Zombie } from './Zombie'
import { damagePlant } from '../plants/damage'
import { zombieFacingRect, isHostile, plantTeam, teamDirection, zombieTeam } from '@/shared/content/teams'
import { plantRect } from '../combat/targets'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import { mindControl } from './mindControl'
import { meltIce } from '../combat/ice'
import { plantsInPlay } from '../level/lawn'

const CHILLED_BITE_CADENCE_FACTOR = 2
/**
 * A plant's body span on its row; plants do not move during a run. `rolling`: a plant off the grid (a rolling nut),
 * which a pole vaulter vaults over (`vault.bowlingAttack`) but no zombie bites.
 */
interface PlantTarget { plant: Plant, left: number, right: number, rolling: boolean }

export function createZombieSystem(definitions: GameplayDefinitions): GameSystem { return new ZombieSystem(definitions) }

/**
 * Every zombie's tick (Zombie::Update): what any zombie does, asking the zombie (its kind's class) what only its kind
 * does: what it does of its own each tick (a vault, a dance, a gasp), whether and with what it eats, how it walks on
 * and into the house.
 */
export class ZombieSystem implements GameSystem {
    readonly id = 'pvz:zombie-lifecycle'
    /** Plants by row, collected once per run; their objects are not replaced during it. */
    private plantRows: PlantTarget[][] = []
    /** Both sides have zombies on the lawn this run; otherwise no zombie can bite another. */
    private bothSides = false
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const { world, commands } = context
        const definitions = this.definitions

        const level = world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return

        for (const plant of plantsInPlay(world)) if (plant.recentlyEatenCounter > 0) plant.recentlyEatenCounter--
        this.plantRows = []
        for (const plant of plantsInPlay(world)) {
            const { position } = plant, type = definitions.plants[plant.typeId], body = plantRect(definitions, plant)
            ;(this.plantRows[position.row] ??= []).push({ plant, left: body.x, right: body.x + body.width, rolling: type.occupiesCell === false })
        }

        const sides = new Set([...world.zombies].map(zombie => zombieTeam(zombie)))
        this.bothSides = sides.size > 1
        for (const zombie of world.zombies) zombie.beforeTick(world)
        // An earlier zombie's bite may have blown one up: the list passes it over.
        for (const zombie of world.zombies) {
            const { id: entity, position } = zombie
            // Zombie::CheckForBoardEdge: a zombie walking right leaves past x = 850, without loot (DieNoLoot).
            if (teamDirection(zombieTeam(zombie)) > 0 && position.x > 850) {
                commands.destroyEntity(entity)
                continue
            }
            // Zombie::Update counts its age first, whatever it does then.
            zombie.age++
            zombie.count()
            const definition = definitions.zombies[zombie.typeId], animation = definition.animation
            const random = world.resources.get(RandomResource)
            if (zombie.state === 'mowered') {
                stepZombie(zombie, animation, random)
                if (squashed(zombieBody(zombie))) {
                    if (zombie.hasHead) {
                        zombie.hasHead = false
                        zombiePartDropped(world, entity, 'head', { mowered: true })
                    }
                    if (zombie.hasArm) {
                        zombie.hasArm = false
                        zombiePartDropped(world, entity, 'arm', { mowered: true })
                    }
                    commands.destroyEntity(entity)
                }
                continue
            }
            if (zombie.state === 'dying') {
                const body = zombieBody(zombie), death = animation.clips[body.clip], previous = body.time
                stepZombie(zombie, animation, random)
                if (passedMark(death, previous, body.time, death.marks![0])) {
                    emitServerEvent(world.resources.get(EventQueueResource), 'zombieDying', {
                        entityId: entity,
                        typeId: zombie.typeId,
                        clip: body.clip,
                    })
                }
                if (--zombie.deathTicksRemaining <= 0) commands.destroyEntity(entity)
                continue
            }
            if (zombie.state === 'burned') {
                if (--zombie.deathTicksRemaining <= 0) commands.destroyEntity(entity)
                continue
            }
            if (zombie.health <= 0) {
                startZombieDeath(world, definitions, zombie)
                continue
            }
            // Zombie::UpdatePlaying: the ice counts down first, so a zombie whose ice runs out acts on that tick.
            meltIce(world, zombie)
            if (zombie.chilledTicks > 0) zombie.chilledTicks--
            if (zombie.frozenTicks !== undefined) {
                // Zombie::IsImmobilizied: it neither moves nor eats, its body still (zombiePace); what it carries goes on,
                // and a headless one goes on dying.
                stepZombie(zombie, animation, random)
                if (!zombie.hasHead) updateHeadlessZombie(world, definitions, zombie)
                continue
            }
            if (zombie.riseTicks) {
                // Zombie::Update stops a rising zombie before UpdatePlaying moves it, but UpdateReanim still plays its walk.
                stepZombie(zombie, animation, random)
                zombie.riseTicks--
                continue
            }
            if (zombie.pauses(context)) continue
            this.updateActive(context, entity)
            if (world.resources.get(LevelStateResource).result === 'lost') return
        }
    }
    updateActive(context: SystemContext, entity: number): void {
        const { world, commands } = context, definitions = this.definitions
        const zombie = world.zombies.get(entity)!, position = zombie.position
        const definition = definitions.zombies[zombie.typeId], animation = definition.animation
        const level = world.resources.get(LevelStateResource), random = world.resources.get(RandomResource)
        const team = zombieTeam(zombie)
        const hostilePlants = (this.plantRows[position.row] ?? []).filter(target => isHostile(plantTeam(target.plant), team))
        // Zombie::mX: where it stood as the tick began, in whole pixels, which its attack reaches from all the tick.
        const x = Math.trunc(position.x)

        // Zombie::UpdateActions: what its kind does of its own, which may take the tick (a pole vaulter's vault).
        if (!zombie.act(context, (attack, rollingAttack) => findPlantTarget(world, hostilePlants, x, attack, rollingAttack))) {
            // Zombie::CheckIfPreyCaught: on every `cadenceTicks`-th tick of its age, twice as far apart while it is chilled,
            // it looks for an enemy zombie, then a plant, to bite; between, it goes on as it was.
            const attack = zombieFacingRect(zombie.attackRect(), team)
            const cadence = definition.bite.cadenceTicks * (zombie.chilledTicks > 0 ? CHILLED_BITE_CADENCE_FACTOR : 1)
            const looks = zombie.age % cadence === 0 && zombie.eats()
            const prey = looks && this.bothSides ? findZombieTarget(world, definitions, zombie, x, attack) : undefined
            let target = looks && prey === undefined ? findPlantTarget(world, hostilePlants, x, attack)?.plant : undefined
            // Zombie::EatPlant: a plant its kind does not bite (it ends a leader's moonwalk).
            if (target !== undefined && zombie.passesPlant()) target = undefined
            const caught = prey !== undefined || target !== undefined
            if (zombie.state === 'eating' ? looks && !caught : !caught) {
                if (zombie.state === 'eating') {
                    // Zombie::StopEating, having stood this tick: StartWalkAnim picks its speed and walk again, so a
                    // mind-controlled one walks at a zombie's own.
                    zombie.state = 'walking'
                    zombie.stopEating(random)
                    stepZombie(zombie, animation, random)
                // Zombie::ZombieNotWalking: it walks unless its kind stands it still (a dancer off its walking steps).
                } else if (zombie.walks(world)) walkZombie(zombie, definition, random, teamDirection(team))
                else stepZombie(zombie, animation, random)
                if (!zombie.hasHead) updateHeadlessZombie(world, definitions, zombie)
            } else {
                const events = world.resources.get(EventQueueResource)
                if (zombie.state !== 'eating') {
                    // Zombie::StartEating, having walked this tick before it looked (UpdateZombiePosition).
                    if (zombie.walks(world)) moveZombie(zombie, definition, teamDirection(team))
                    zombie.state = 'eating'
                    playZombie(zombie, animation, ZOMBIE_CLIPS.eat, random)
                }
                // Zombie::EatZombie bites through the shield and without a flash. EatPlant does not hurt a plant that is
                // inedible now, nor one that mind-controls what eats it (an awake hypno-shroom).
                if (prey !== undefined) {
                    const victim = world.zombies.get(prey)!
                    damageZombie(world, definitions, prey, definition.bite.damage, { flash: false, bypassShield: true }, commands)
                    if (victim.health <= 0) emitServerEvent(events, 'zombieAteZombie', { zombieId: entity, targetId: prey })
                } else if (target !== undefined && !target.inedible(world) && !target.mindControls(world)) {
                    damagePlant(world, definitions, target.id, definition.bite.damage, commands, undefined, entity)
                }
                const body = zombieBody(zombie), eat = animation.clips[ZOMBIE_CLIPS.eat], previous = body.time
                stepZombie(zombie, animation, random)
                if (!zombie.hasHead) {
                    updateHeadlessZombie(world, definitions, zombie)
                } else {
                    // Zombie::Animate: at its eat's chews, AnimateChewSound and AnimateChewEffect look anew for the plant
                    // it chews, which the client flashes.
                    if (eat.marks!.some(mark => passedMark(eat, previous, body.time, mark))) {
                        const plant = findPlantTarget(world, hostilePlants, x, attack)?.plant
                        // An awake hypno-shroom turns the zombie as it chews, in place of the chew.
                        if (plant?.mindControls(world)) {
                            mindControl(world, definitions, entity, plant.id, commands)
                            return
                        }
                        const chewing = plant === undefined && this.bothSides ? findZombieTarget(world, definitions, zombie, x, attack) : undefined
                        if (chewing !== undefined) emitServerEvent(events, 'zombieChewedZombie', { zombieId: entity, targetId: chewing })
                        // With neither, it chews at nothing, its prey gone before it looks again: the chew's sound alone.
                        else emitServerEvent(events, 'zombieChewedPlant', plant ? { zombieId: entity, plantId: plant.id } : { zombieId: entity })
                    }
                }
            }
        }

        // Zombie::CheckForBoardEdge: only headed zombies win; headless bodies die 70px earlier. Zombies walking right
        // left the lawn before this.
        const edge = definition.boardEdgeX
        if (teamDirection(team) > 0) return
        if (!zombie.hasHead && position.x <= edge + 70) {
            damageZombie(world, definitions, entity, 1800, { flash: false })
        } else if (zombie.hasHead && level.result === 'playing' && position.x <= edge) {
            // Zombie::WalkIntoHouse, as its kind has it (a pole vaulter lets its pole go, a dancer walks in on its walk).
            zombie.intoHouse(random)
            level.result = 'lost'
            emitServerEvent(world.resources.get(EventQueueResource), 'levelLost', {
                zombieId: entity,
            })
            return
        }
    }
}

/**
 * Zombie::FindZombieTarget: the first enemy zombie on the row, standing, whose body the attack rect overlaps by 20, or
 * at all while it eats. `x` is where the zombie stood as its tick began and each other is where it stands, in whole
 * pixels (Zombie::mX).
 */
function findZombieTarget(
    world: World,
    definitions: GameplayDefinitions,
    zombie: Zombie,
    x: number,
    attack: { x: number, width: number },
): number | undefined {
    const { id: self, position } = zombie, team = zombieTeam(zombie)
    const left = x + attack.x, right = left + attack.width
    for (const other of world.zombies) {
        const { id: entity, position: at } = other
        if (entity === self) continue
        const otherTeam = zombieTeam(other)
        if (at.row !== position.row || !isHostile(team, otherTeam) || other.health <= 0 || !world.hasEntity(entity) || isDeadOrDying(other)) continue
        const body = zombieFacingRect(definitions.zombies[other.typeId].body, otherTeam), otherX = Math.trunc(at.x)
        const overlap = Math.min(right, otherX + body.x + body.width) - Math.max(left, otherX + body.x)
        if (overlap >= 20 || overlap >= 0 && other.state === 'eating') return entity
    }
    return undefined
}

/**
 * Zombie::FindPlantTarget: the first of the row's plants, in slot order (EntityList), that `attack` overlaps by 20
 * from `x`, where the zombie stood as its tick began in whole pixels (Zombie::mX); a rolling nut by `rollingAttack`, and
 * none without it. Of plants stacked on one cell it takes the top one (Zombie::CanTargetPlant, Board::GetTopPlantAt),
 * the one in the highest slot (Board::GetPlantsOnLawn), while that one is reached too.
 */
function findPlantTarget(
    world: World,
    /** The plants on the zombie's row. */
    plants: readonly PlantTarget[],
    x: number,
    attack: { x: number, width: number },
    rollingAttack?: { x: number, width: number },
): PlantTarget | undefined {
    const reached = (candidate: PlantTarget) => {
        const reach = candidate.rolling ? rollingAttack : attack
        if (!reach) return false
        const left = x + reach.x
        if (Math.min(left + reach.width, candidate.right) - Math.max(left, candidate.left) < 20) return false
        // An earlier zombie may have finished this plant during the same run.
        return candidate.plant.health > 0 && world.hasEntity(candidate.plant.id)
    }
    // A zombie looks often, so the span overlap test comes before entity lookups.
    for (let i = 0; i < plants.length; i++) {
        const candidate = plants[i]
        if (!reached(candidate)) continue
        const { column } = candidate.plant
        if (!candidate.rolling && plants.some((other, j) => j > i && !other.rolling && other.plant.column === column && reached(other))) continue
        return candidate
    }
    return undefined
}
