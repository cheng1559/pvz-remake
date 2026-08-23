System.register([], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    function register(api) {
        api.registerContent({ id: 'phase0:client', kind: 'client-bundle' });
        api.enhanceAnimation('pvz:peashooter', { shootHead: { rateScale: 45 / 35 } });
    }
    exports_1("register", register);
    return {
        setters: [],
        execute: function () {
        }
    };
});
