import { PlantView, type ShownPlant } from './PlantView'

export class ChomperView extends PlantView {
    show(plant: ShownPlant): void {
        super.show(plant)
        // The chew and swallow clips draw the eaten zombie's arm; a swallowed plant has none.
        this.body.setTracksVisible(this.presentation.parts?.prey ?? [], plant.ability?.prey !== 'plant')
    }
}
