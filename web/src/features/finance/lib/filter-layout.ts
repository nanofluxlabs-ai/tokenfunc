/**
 * 财务中心筛选栏的移动端布局：手机端用网格把筛选项与按钮排成整齐的行，sm 起恢复单行 flex。
 * 按钮在手机端撑满所在格子；英文等较长文案允许折行而不是溢出格子。
 */
export const FILTER_BAR_BUTTON_CLASS =
  'h-auto min-h-7 w-full whitespace-normal sm:h-7 sm:w-auto sm:whitespace-nowrap'
