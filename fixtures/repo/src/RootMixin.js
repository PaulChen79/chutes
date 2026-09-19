import Vue from "vue";

// A global mixin touching every component in the application. Vue 3
// keeps global mixins but the app instance replaces the global Vue.
Vue.mixin({
  beforeCreate() {
    this.$logger = this.$root.$options.logger;
  },
  destroyed() {
    this.$logger && this.$logger.flush();
  },
});
