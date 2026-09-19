<template><em>{{ text }}</em></template>
<script>
export default {
  props: { text: String },
  data() {
    return { hovered: false };
  },
  methods: {
    enter() {
      this.hovered = true;
    },
    leave() {
      this.hovered = false;
    },
  },
};
</script>
