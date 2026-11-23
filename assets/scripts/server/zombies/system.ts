import { playZombie, stepZombie, walkZombie, zombieBody } from './animation'
import { passedMark } from '@/shared/content/animation'
import { squashed } from '@/shared/content/zombieAnimation'
import { EventQueueResource, emitServerEvent, type EventQueue } from '../state/events'
import type { GameSystem, Position, SystemContext, World } from '@/server/state/World'
import { type GameplayDefinitions, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import { damageZombie, startZombieDeath, updateHeadlessZombie } from './damage'
import { zombiePartDropped } from './parts'
import { type LevelState, LevelStateResource, RandomResource } from '../state/resources'
import type { DeterministicRng } from '../state/DeterministicRng'
import type { Plant } from '../plants/Plant'
import type { Zombie } from './Zombie'
import { damagePlant } from '../plants/damage'
import { zombieFacingRect, isHostile, plantFacingRect, plantTeam, teamDirection, zombieTeam } from '@/shared/content/teams'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import { mindControl } from './mindControl'
import { meltIce } from '../combat/ice'
import { plantInPlay, plantsInPlay } from '../level/lawn'

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
    /** A row's plants that a zombie of a side bites, by the side and the row: sorted out once a run for all its zombies. */
    private hostileRows = new Map<ReturnType<typeof zombieTeam>, PlantTarget[][]>()
    /** Both sides have zombies on the lawn this run; otherwise no zombie can bite another. */
    private bothSides = false
    /**
     * The level's state, its random numbers and its events, looked up once a run for all its zombies: a session sets
     * them as it starts or is restored, never during a run.
     */
    private level!: LevelState
    private random!: DeterministicRng
    private events!: EventQueue
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const { world, commands } = context
        const definitions = this.definitions

        const level = world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return
        this.level = level
        const random = this.random = world.resources.get(RandomResource)
        this.events = world.resources.get(EventQueueResource)

        for (const plant of plantsInPlay(world)) if (plant.recentlyEatenCounter > 0) plant.recentlyEatenCounter--
        this.plantRows = []
        this.hostileRows.clear()
        for (const plant of plantsInPlay(world)) {
            const { position } = plant, type = definitions.plants[plant.typeId]
            const body = plantFacingRect(type.body, plantTeam(plant)), left = position.x + body.x
            ;(this.plantRows[position.row] ??= []).push({ plant, left, right: left + body.width, rolling: type.occupiesCell === false })
        }

        // Whether zombies of two sides are on the lawn.
        let side: ReturnType<typeof zombieTeam> | undefined
        this.bothSides = false
        for (const zombie of world.zombies) {
            const team = zombieTeam(zombie)
            if (side === undefined) side = team
            else if (team !== side) { this.bothSides = true; break }
        }
        for (const zombie of world.zombies) zombie.beforeTick(world)
        // An earlier zombie's bite may have blown one up: the list passes it over.
        for (const zombie of world.zombies) {
            const { id: entity, position } = zombie
            // Zombie::CheckForBoardEdge: a zombie walking right leaves past x = 850, without loot (DieNoLoot).
            if (teamDirection(zombieTeam(zombie)) > 0 && position.x > 850) {
                commands.destroyEntity(entity)
                continue
            }
            zombie.count()
            const definition = definitions.zombies[zombie.typeId], animation = definition.animation
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
                    emitServerEvent(this.events, 'zombieDying', {
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
            this.updateActive(context, entity, zombie)
            // It may have walked into the house.
            if (this.level.result === 'lost') return
        }
    }
    /** A zombie's tick as it acts, eats or walks, within a run (its plants and resources); the run passes `zombie` as it has it. */
    updateActive(context: SystemContext, entity: number, zombie = context.world.zombies.get(entity)!): void {
        const { world, commands } = context, definitions = this.definitions
        const position = zombie.position
        const definition = definitions.zombies[zombie.typeId], animation = definition.animation
        const { level, random, events } = this
        const team = zombieTeam(zombie)
        let rows = this.hostileRows.get(team)
        if (!rows) this.hostileRows.set(team, rows = [])
        const hostilePlants = rows[position.row] ??= (this.plantRows[position.row] ?? []).filter(target => isHostile(plantTeam(target.plant), team))

        // Zombie::UpdateActions: what its kind does of its own, which may take the tick (a pole vaulter's vault).
        if (!zombie.act(context, (attack, rollingAttack) => findPlantTarget(world, hostilePlants, position, attack, rollingAttack))) {
            // Zombie::UpdateEating bites an enemy zombie first, then a plant (CheckIfPreyCaught, if its kind eats now).
            const attack = zombieFacingRect(zombie.attackRect(), team)
            const eats = zombie.eats()
            const prey = eats && this.bothSides ? findZombieTarget(world, definitions, zombie, attack) : undefined
            let target = eats && prey === undefined ? findPlantTarget(world, hostilePlants, position, attack)?.plant.id : undefined
            // Zombie::EatPlant: a plant its kind does not bite (it ends a leader's moonwalk).
            if (target !== undefined && zombie.passesPlant()) target = undefined
            if (target === undefined && prey === undefined) {
                if (zombie.state !== 'walking') {
                    // Zombie::StopEating: StartWalkAnim picks its speed and walk again, so a mind-controlled one walks at a zombie's own.
                    zombie.state = 'walking'
                    zombie.stopEating(random)
                }
                zombie.biteTicks = 0
                // Zombie::ZombieNotWalking: it walks unless its kind stands it still (a dancer off its walking steps).
                if (zombie.walks(world)) walkZombie(zombie, definition, random, teamDirection(team))
                else stepZombie(zombie, animation, random)
                if (!zombie.hasHead) updateHeadlessZombie(world, definitions, zombie)
            } else {
                if (zombie.state !== 'eating') {
                    zombie.state = 'eating'
                    playZombie(zombie, animation, ZOMBIE_CLIPS.eat, random)
                }
                const body = zombieBody(zombie), eat = animation.clips[ZOMBIE_CLIPS.eat], previous = body.time
                stepZombie(zombie, animation, random)
                if (!zombie.hasHead) {
                    updateHeadlessZombie(world, definitions, zombie)
                } else {
                    // Zombie::EatZombie bites an enemy zombie as it bites a plant, but through the shield and without
                    // a flash. The client flashes a chewed plant. A loop, not `some`: no function made for each zombie.
                    const marks = eat.marks!, time = body.time
                    let chewed = false
                    for (let i = 0; i < marks.length && !chewed; i++) chewed = passedMark(eat, previous, time, marks[i])
                    const cadence = definition.bite.cadenceTicks * (zombie.chilledTicks > 0 ? CHILLED_BITE_CADENCE_FACTOR : 1)
                    const bites = ++zombie.biteTicks >= cadence
                    if (bites) zombie.biteTicks = 0
                    if (prey !== undefined) {
                        if (chewed) emitServerEvent(events, 'zombieChewedZombie', { zombieId: entity, targetId: prey })
                        if (bites) {
                            const victim = world.zombies.get(prey)!
                            damageZombie(world, definitions, prey, definition.bite.damage, { flash: false, bypassShield: true }, commands)
                            if (victim.health <= 0) emitServerEvent(events, 'zombieAteZombie', { zombieId: entity, targetId: prey })
                        }
                    } else if (target !== undefined) {
                        const plant = plantInPlay(world, target)!
                        // Zombie::AnimateChewSound: an awake hypno-shroom turns the zombie as it chews, in place of the chew.
                        if (chewed && plant.mindControls(world)) {
                            mindControl(world, definitions, entity, target, commands)
                            return
                        }
                        if (chewed) emitServerEvent(events, 'zombieChewedPlant', { zombieId: entity, plantId: target })
                        if (bites && !plant.inedible(world)) damagePlant(world, definitions, target, definition.bite.damage, commands, undefined, entity)
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
            emitServerEvent(events, 'levelLost', {
                zombieId: entity,
            })
            return
        }
    }
}

/**
 * Zombie::FindZombieTarget: the first enemy zombie on the row, standing, whose body the attack rect overlaps by 20, or
 * at all while it eats.
 */
function findZombieTarget(
    world: World,
    definitions: GameplayDefinitions,
    zombie: Zombie,
    attack: { x: number, width: number },
): number | undefined {
    const { id: self, position } = zombie, team = zombieTeam(zombie)
    const left = position.x + attack.x, right = left + attack.width
    for (const other of world.zombies) {
        const { id: entity, position: at } = other
        if (entity === self) continue
        const otherTeam = zombieTeam(other)
        if (at.row !== position.row || !isHostile(team, otherTeam) || other.health <= 0 || !world.hasEntity(entity) || isDeadOrDying(other)) continue
        const body = zombieFacingRect(definitions.zombies[other.typeId].body, otherTeam)
        const overlap = Math.min(right, at.x + body.x + body.width) - Math.max(left, at.x + body.x)
        if (overlap >= 20 || overlap >= 0 && other.state === 'eating') return entity
    }
    return undefined
}

/** The plant `attack` reaches, a rolling nut by `rollingAttack` (none without it). */
function findPlantTarget(
    world: World,
    /** The plants on the zombie's row. */
    plants: readonly PlantTarget[],
    zombiePosition: Position,
    attack: { x: number, width: number },
    rollingAttack?: { x: number, width: number },
): PlantTarget | undefined {
    let target: PlantTarget | undefined
    // Runs for every zombie on every tick: the spans are compared, without calls, before anything of a plant is read.
    const x = zombiePosition.x, left = x + attack.x, right = left + attack.width
    const rollingLeft = rollingAttack ? x + rollingAttack.x : 0, rollingRight = rollingAttack ? rollingLeft + rollingAttack.width : 0
    for (let i = 0; i < plants.length; i++) {
        const candidate = plants[i]
        let from = left, to = right
        if (candidate.rolling) {
            if (!rollingAttack) continue
            from = rollingLeft
            to = rollingRight
        }
        if ((to < candidate.right ? to : candidate.right) - (from > candidate.left ? from : candidate.left) < 20) continue
        const { plant } = candidate, { id: entity, position } = plant
        // An earlier zombie may have finished this plant during the same run.
        if (plant.health <= 0 || !world.hasEntity(entity)) continue
        if (!target || position.x < target.plant.position.x || (position.x === target.plant.position.x && entity < target.plant.id)) target = candidate
    }
    return target
}
