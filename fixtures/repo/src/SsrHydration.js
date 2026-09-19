import Vue from "vue";

// Vue 2 hydration mismatches were silent; Vue 3 errors. Code that
// depended on the old forgiving behaviour has to be reworked.
export function hydrate(el, options) {
  return new Vue({ el, hydrating: true, ...options });
}
