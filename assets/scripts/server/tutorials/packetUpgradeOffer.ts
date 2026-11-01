import { EconomyStateResource, PacketUpgradeOfferResource } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { TutorialResource } from '../state/levelState'
import type { TutorialScript } from './index'

/** CutScene::StartLevelIntro's seed-slot pitch: 1501-1503, then 1510-1511 after Yes or 1520 after No. */
const PITCH = [1501, 1502, 1503], ACCEPTED = [1510, 1511], DECLINED = [1520]
/** 1503 ({NO_CLICK}) waits for the Yes/No dialog instead of a click. */
const QUESTION = 1503
/** The `pvz:dialog` question kind the client answers with DIALOG_PURCHASE_PACKET_SLOT. */
export const PACKET_UPGRADE_QUESTION = 'pvz:packetUpgrade'

/**
 * Crazy Dave offers the first seed-slot upgrade on a first adventure when the player can afford it, owns none and has
 * not turned it down twice (CutScene::CanGetPacketUpgrade); otherwise the level has no dialogue.
 */
export const packetUpgradeOffer: TutorialScript = {
    blocksIntro: true,
    dave: true,
    initialize(world, firstAdventure) {
        const offer = world.resources.has(PacketUpgradeOfferResource) ? world.resources.get(PacketUpgradeOfferResource) : undefined
        const economy = world.resources.get(EconomyStateResource)
        if (!firstAdventure || !offer || (economy.packetUpgrades ?? 0) > 0 || economy.money < offer.cost) return
        const tutorial = world.resources.get(TutorialResource)
        tutorial.step = 'dave-opening'
        tutorial.dialogIndex = PITCH[0]
    },
    advanceDialog(world) {
        const tutorial = world.resources.get(TutorialResource)
        const index = tutorial.dialogIndex
        if (index === undefined || index === QUESTION) return
        const sequence = [PITCH, ACCEPTED, DECLINED].find(lines => lines.includes(index))!
        tutorial.dialogIndex = sequence[sequence.indexOf(index) + 1]
        if (tutorial.dialogIndex === undefined) tutorial.step = 'complete'
    },
    dialogQuestion(world, definitions) {
        if (world.resources.get(TutorialResource).dialogIndex !== QUESTION) return undefined
        // CutScene: the dialog quotes the price and mPurchases + 7 slots.
        const slots = definitions.seedBank.baseSlots + (world.resources.get(EconomyStateResource).packetUpgrades ?? 0) + 1
        return { kind: PACKET_UPGRADE_QUESTION, cost: world.resources.get(PacketUpgradeOfferResource).cost, slots }
    },
    answerDialog(world, accept) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.dialogIndex !== QUESTION) return
        const offer = world.resources.get(PacketUpgradeOfferResource)
        const events = world.resources.get(EventQueueResource)
        if (accept) {
            // PlayerInfo::AddCoins(-cost) and mPurchases++; the new slot joins this level's chooser (SeedBank::UpdateWidth).
            const economy = world.resources.get(EconomyStateResource)
            economy.money -= offer.cost
            economy.packetUpgrades = (economy.packetUpgrades ?? 0) + 1
            economy.diamonds = true
            emitServerEvent(events, 'packetUpgradePurchased', { cost: offer.cost, upgrades: economy.packetUpgrades })
            tutorial.dialogIndex = ACCEPTED[0]
        } else {
            // PlayerInfo::mDidntPurchasePacketUpgrade++.
            emitServerEvent(events, 'packetUpgradeDeclined', {})
            tutorial.dialogIndex = DECLINED[0]
        }
    },
}
