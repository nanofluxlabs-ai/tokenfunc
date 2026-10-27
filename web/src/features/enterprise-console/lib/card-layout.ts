/**
 * 卡片头部右侧的页签（CardAction）在窄卡片里换到标题下面一行，不再挤压标题与描述。
 * 按卡片头部的容器宽度判断（@md/card-header ≈ 448px），手机与窄抽屉都会生效。
 */
export const CARD_ACTION_STACKED =
  'col-span-2 col-start-1 row-start-3 mt-2 justify-self-start @md/card-header:col-span-1 @md/card-header:col-start-2 @md/card-header:row-span-2 @md/card-header:row-start-1 @md/card-header:mt-0 @md/card-header:justify-self-end'
