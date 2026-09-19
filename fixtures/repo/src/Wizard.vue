<template><section><slot :step="step" /></section></template>
<script>
import persistence from "../mixins/persistence.js";
import steps from "../mixins/steps.js";
export default {
  mixins: [steps, persistence],
  data() {
    return { step: 0 };
  },
  methods: {
    next() {
      this.step += 1;
    },
    back() {
      this.step -= 1;
    },
  },
};
</script>
