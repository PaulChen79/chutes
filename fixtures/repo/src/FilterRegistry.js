import Vue from "vue";

// Global filters were removed in Vue 3.
Vue.filter("currency", (v) => `$${(v / 100).toFixed(2)}`);
Vue.filter("titlecase", (v) => v.replace(/\b\w/g, (c) => c.toUpperCase()));

export default Vue;
