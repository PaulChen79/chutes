import Vue from "vue";

// A Vue 2 instance used as a global event bus. Vue 3 removes $on/$off
// entirely, so every subscriber has to be rewritten too.
export default new Vue();
