import {profile_prompts} from "../../data/profile_prompts.js";

/**
 * 初始化表格刷新类型选择器
 * 根据profile_prompts对象动态生成下拉选择器的选项
 */
export function initRefreshTypeSelector() {
    const $selector = $('#table_refresh_type_selector');
    if (!$selector.length) return;
    
    // 清空现有选项
    $selector.empty();
    
    // 遍历profile_prompts对象，添加选项
    Object.entries(profile_prompts).forEach(([key, value]) => {
        const option = $('<option></option>')
            .attr('value', key)
            .text(value.name || key);
        $selector.append(option);
    });
    
    // 如果没有选项，添加默认选项
    if ($selector.children().length === 0) {
        $selector.append($('<option></option>').attr('value', 'rebuild').text('完整重建（推荐）'));
        $selector.append($('<option></option>').attr('value', 'refresh').text('立即整理'));
    }
    
    console.log('表格刷新类型选择器初始化完成');
}