import { EconomyStateResource, PacketUpgradeOfferResource } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { TutorialResource } from '../state/levelState'
import type { TutorialScript } from './index'

/**
 * CutScene::StartLevelIntro's seed-slot pitches, by the upgrade each sells: the first slot's, 1501-1503, then 1510-1511
 * after Yes or 1520 after No; the second's, 1551-1553, then 1560 or 1570. A pitch's last line ({NO_CLICK}) waits for
 * the Yes/No dialog instead of a click.
 */
const OFFERS = [
    { pitch: [1501, 1502, 1503], accepted: [1510, 1511], declined: [1520] },
    { pitch: [1551, 1552, 1553], accepted: [1560], declined: [1570] },
]
/** The snapshot's `dialog.question` kind the client answers with DIALOG_PURCHASE_PACKET_SLOT. */
export const PACKET_UPGRADE_QUESTION = 'pvz:packetUpgrade'

/** The pitch whose question Dave is asking now, if he is. */
const asking = (index: number | undefined) => OFFERS.find(offer => offer.pitch.at(-1) === index)

/**
 * Crazy Dave offers the next seed-slot upgrade on a first adventure, of the first `upgrades`: the first slot on levels
 * 13-24 (CutScene::CanGetPacketUpgrade), and from level 16 the second to one who owns the first
 * (CanGetSecondPacketUpgrade), when the player can afford it and has not turned the offers down twice (no offer is
 * made then); otherwise the level has no dialogue.
 */
export function packetUpgradeOffers(upgrades: number): TutorialScript {
    return {
        blocksIntro: true,
        dave: true,
        initialize(world, firstAdventure) {
            const offer = world.resources.has(PacketUpgradeOfferResource) ? world.resources.get(PacketUpgradeOfferResource) : undefined
            const economy = world.resources.get(EconomyStateResource), owned = economy.packetUpgrades
            if (!firstAdventure || !offer || owned >= Math.min(upgrades, OFFERS.length) || economy.money < offer.cost) return
            const tutorial = world.resources.get(TutorialResource)
            tutorial.step = 'dave-opening'
            tutorial.dialogIndex = OFFERS[owned].pitch[0]
        },
        advanceDialog(world) {
            const tutorial = world.resources.get(TutorialResource)
            const index = tutorial.dialogIndex
            if (index === undefined || asking(index)) return
            const sequence = OFFERS.flatMap(offer => [offer.pitch, offer.accepted, offer.declined]).find(lines => lines.includes(index))!
            tutorial.dialogIndex = sequence[sequence.indexOf(index) + 1]
            if (tutorial.dialogIndex === undefined) tutorial.step = 'complete'
        },
        dialogQuestion(world, definitions) {
            if (!asking(world.resources.get(TutorialResource).dialogIndex)) return undefined
            // CutScene: the dialog quotes the price and mPurchases + 7 slots.
            const slots = definitions.seedBank.baseSlots + world.resources.get(EconomyStateResource).packetUpgrades + 1
            return { kind: PACKET_UPGRADE_QUESTION, cost: world.resources.get(PacketUpgradeOfferResource).cost, slots }
        },
        answerDialog(world, accept) {
            const tutorial = world.resources.get(TutorialResource)
            const pitch = asking(tutorial.dialogIndex)
            if (!pitch) return
            const offer = world.resources.get(PacketUpgradeOfferResource)
            const events = world.resources.get(EventQueueResource)
            if (accept) {
                // PlayerInfo::AddCoins(-cost) and mPurchases++; the new slot joins this level's chooser (SeedBank::UpdateWidth).
                const economy = world.resources.get(EconomyStateResource)
                economy.money -= offer.cost
                economy.packetUpgrades++
                economy.ownedUpgrades++
                emitServerEvent(events, 'packetUpgradePurchased', { cost: offer.cost, upgrades: economy.packetUpgrades })
                tutorial.dialogIndex = pitch.accepted[0]
            } else {
                // PlayerInfo::mDidntPurchasePacketUpgrade++.
                emitServerEvent(events, 'packetUpgradeDeclined', {})
                tutorial.dialogIndex = pitch.declined[0]
            }
        },
    }
}

/** Levels 13-15: the first seed-slot upgrade only. */
export const packetUpgradeOffer = packetUpgradeOffers(1)
