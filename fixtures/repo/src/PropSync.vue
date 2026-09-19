<template><input :value="value" @input="$emit('update:value', $event.target.value)"></template>
<script>
export default {
  // .sync was removed in Vue 3 in favour of v-model arguments, which
  // changes how every caller binds this component.
  model: { prop: "value", event: "update:value" },
  props: { value: String },
};
</script>
