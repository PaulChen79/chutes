import Vue from "vue";

// Custom directive lifecycle hooks were renamed in Vue 3
// (bind/inserted/update -> beforeMount/mounted/updated).
Vue.directive("observe", {
  bind(el, binding) {
    el.__observer = new IntersectionObserver(binding.value);
  },
  inserted(el) {
    el.__observer.observe(el);
  },
  unbind(el) {
    el.__observer.disconnect();
  },
});
