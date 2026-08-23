System.register([], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    function register(api) {
        api.registerPlantUpgrade({
            seedId: 'pvz:peashooter',
            targetPlantId: 'pvz:peashooter',
            resultSeedId: 'pvz:repeater',
        });
    }
    exports_1("register", register);
    return {
        setters: [],
        execute: function () {
        }
    };
});
