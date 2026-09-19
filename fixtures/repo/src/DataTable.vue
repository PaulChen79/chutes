<template><table><slot name="row" v-for="r in rows" :row="r" /></table></template>
<script>
import sortable from "../mixins/sortable.js";
export default {
  mixins: [sortable],
  props: { rows: Array },
  data() {
    return { page: 1 };
  },
};
</script>
