<template><input type="checkbox" :checked="on" @change="flip"></template>
<script>
export default {
  data() {
    return { on: false };
  },
  methods: {
    flip() {
      this.on = !this.on;
    },
  },
};
</script>
