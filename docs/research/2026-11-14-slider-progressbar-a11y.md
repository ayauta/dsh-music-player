# slider / progressbar / meter 的规范依据（2026-11-14）

> 目的：给 [D-28 的补记](../../docs/DECISIONS.md) 那句**无来源**结论「一个不响应方向键的 slider 是错误的无障碍声明」找一手依据，或证明它不成立。
> 标记规则：**【原文】** = 规范正文英文原句；**【转述】** = W3C 非规范性解读（Understanding / APG）的概括。所有链接访问日期 **2026-11-14**。

## 0. 一句话结论

**部分成立。** 方向键要求**不在** ARIA 1.2 的 normative 文本里（ARIA 对 slider 只 MUST `aria-valuenow`），键盘模型出自 APG（WAI 自述 informative）；所以"错误声明"不能挂在 ARIA 条款上，只能挂在**"role 是承诺"**（WAI 非规范原则）+ **WCAG SC 2.1.1**（pointer 能改、键盘不能）。而 D-28 换成的 progressbar 恰好被 ARIA 原文钉死为 "always read-only"，**新声明比旧声明更假**。

## 1. 三个问题

### 1.1 ARIA 对 `role="slider"` 的键盘要求 —— 规范里没有 MUST/SHOULD

- WAI-ARIA 1.2 §5.4 `slider`（W3C REC, 2023-06-06）【原文】：`An input where the user selects a value from within a given range.` / `It is typically possible to add or subtract to the value by using directional keys such as arrow keys.`
  → 注意措辞是 **"typically possible"**，不是 MUST/SHOULD。
  <https://www.w3.org/TR/wai-aria-1.2/#slider>
- 同节 `slider` 的 Required States：**唯一 MUST**【原文】：`Authors MUST set the aria-valuenow attribute.`
  → 结论：**ARIA 1.2 未对方向键作 MUST 或 SHOULD 规定**（条款编号不存在；这是"未找到"，不是"没写"）。
- APG Slider Pattern → Keyboard Interaction【原文】：`Right Arrow: Increase the value of the slider by one step.` / `Up Arrow` / `Left Arrow` / `Down Arrow` / `Home: Set the slider to the first allowed value in its range.` / `End: Set the slider to the last allowed value in its range.` / `Page Up (Optional)` / `Page Down (Optional)`
  → 方向键与 Home/End 为常规项，PageUp/PageDown **明确标 Optional**。
  <https://www.w3.org/WAI/ARIA/apg/patterns/slider/>
- APG 自身的效力（关键，决定"错误声明"能不能算违规）【原文】：`The APG does not specify normative requirements and thus does not have a conformance model.` / `While those lists are not normative, the majority of such conventions are so well established that it is advisable to treat them as requirements.`
  <https://www.w3.org/WAI/ARIA/apg/about/introduction/>
- 真正能支撑"错误声明"这句的是 WAI 的这条原则（informative 资源，非规范）【原文】：`Principle 1: A role is a promise` / `… Is a promise that the author of that <div> has also incorporated JavaScript that provides the keyboard interactions expected for a button. Unlike HTML input elements, ARIA roles do not cause browsers to provide keyboard behaviors or styling.` / `Using a role without fulfilling the promise of that role is similar to making a "Place Order" button that abandons an order…`
  <https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/>
- 反向证据（说明"不可编辑的 slider"在规范里合法）：`slider` 的 Supported States 含 `aria-readonly`，其定义【原文】：`Indicates that the element is not editable, but is otherwise operable.` / `This means the user can read but not set the value of the widget.`
  <https://www.w3.org/TR/wai-aria-1.2/#aria-readonly>
  → 因此 `role="slider"` + 只读**不是**规范违例；违例点是"值仍能被指针改，却没有键盘路径"（见 1.2）。

### 1.2 WCAG 2.2 层面

- **SC 2.1.1 Keyboard (Level A)**【原文】：`All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes, except where the underlying function requires input that depends on the path of the user's movement and not just the endpoints.`
  <https://www.w3.org/TR/WCAG22/#keyboard>
- **SC 2.1.3 Keyboard (No Exception) (AAA)**【原文】：`All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes.`
  → 与 2.1.1 同一要求，只删掉"路径相关"那条例外；**不新增**"每个控件都必须响应方向键"的义务。
  <https://www.w3.org/TR/WCAG22/#keyboard-no-exception>
- **SC 4.1.2 Name, Role, Value (Level A)**【原文】：`For all user interface components … the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set; and notification of changes to these items is available to user agents, including assistive technologies.`
  → **原文不含"role 必须正确"**；"role 要合适"来自 W3C 解读【转述】：`What roles and states are appropriate to convey to assistive technology will depend on what the control represents.`
  <https://www.w3.org/TR/WCAG22/#name-role-value> · <https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html>
- 判定：一个 `role="slider"`、指针可拖、键盘不可达的控件 → **违反 SC 2.1.1（A）**：其功能（设定值）无法通过键盘接口完成。SC 2.1.3 同一条要求升到 AAA，不额外成立新违规。**4.1.2 不被字面违反**（name/role/值均程序化可得，且随拖动更新通知）；它被违反的是"role 语义与实际行为不符"这一解读层面。
- 重要限定（W3C 解读，非规范原文）【转述】：`This success criterion does not require that every visible control that can be activated using a mouse or touchscreen must also be focusable and actionable using the keyboard. The normative requirement is only that there must be a way for keyboard interface users to perform the same, or comparable, actions…`
  → 所以 2.1.1 的判据是"**键盘用户有没有同等/可比的操作路径**"，不是"这个 div 必须可聚焦"。
  <https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html>

### 1.3 `progressbar` / `meter` 的语义边界

- **`progressbar` 明示只读**【原文】：`An element that displays the progress status for tasks that take a long time.` / `It is not possible for the user to alter the value of a progressbar because it is always read-only.`
  <https://www.w3.org/TR/wai-aria-1.2/#progressbar>
  → 是的，progressbar **隐含只读、非交互输入**；它连 `aria-readonly` 都不支持（Supported/Inherited 列表里没有），因为它不需要表达"可编辑"。
- **`meter` 定义**【原文】：`An element that represents a scalar measurement within a known range, or a fractional value.` / `Authors SHOULD NOT use the meter role to indicate progress; the progressbar role exists to address that need.`
  <https://www.w3.org/TR/wai-aria-1.2/#meter>
  - HTML 侧同义【原文】：`The meter element represents a scalar measurement within a known range, or a fractional value…` / `This is also known as a gauge.` / `The meter element should not be used to indicate progress (as in a progress bar).`
    <https://html.spec.whatwg.org/multipage/form-elements.html#the-meter-element>
  - `meter` 同样**不支持 `aria-readonly`**，`Children Presentational: True`，超类为 `range`（→`slider` 的超类是 `input` + `range`）——**meter 不是 input 角色**。
  → **冲突成立**：可被用户指针修改的音量用 `meter` 声明，等于把一个"用户设定的输入值"声明成"仪表读数"；规范侧没有任何属性能让它表达"这个值用户改过"。
- 替代方案：原生 `<input type="range">`
  - 隐式 role【原文】（ARIA in HTML）：`input type=range` → `role=slider`，且 `No role other than slider, which is NOT RECOMMENDED.`；允许全局 `aria-*` 与 slider 适用的 `aria-*`。
    <https://www.w3.org/TR/html-aria/#el-input-range>
  - 平台映射【原文】（HTML-AAM）：`input (type attribute in the Range state)` → `Computed Role: slider`。
    <https://www.w3.org/TR/html-aam-1.0/#el-input-range>
  - 键盘行为：**未找到**任何规范条文规定原生 range 的方向键步进行为。HTML 只写到【原文】：`If the element is mutable, the user agent should allow the user to change the number represented by its value`（SHOULD，未规定按键）。
    <https://html.spec.whatwg.org/multipage/input.html#range-state-(type=range)>
    → 因此"原生 range 自带键盘"属于 **UA 实现约定**，不是规范保证；可用的书面依据只有 APG 的 slider 键盘模型（informative）。可达性（Tab 焦点）方面，原生控件属 HTML `focusable area` 定义的范畴。

## 2. 对我们这两个控件的具体判断

**代码事实**（本轮未改动，仅取证）：两个控件都仍是 `role="progressbar"` / `role="meter"`，**却都保留了 pointer 拖动**——`onPointerDown` + `setPointerCapture` + `onPointerMove/Up` 连续调用 `seekTo()` / `onChange()`（[client.js:1222](../../client.js#L1222) 起、[client.js:1281](../../client.js#L1281) 起）。

| 控件 | 现状 | 判断 | 依据 |
|---|---|---|---|
| 进度条 `role="progressbar"` | 指针可拖（可改值），键盘不可达 | **比改之前更差** | `It is not possible for the user to alter the value of a progressbar because it is always read-only.` —— 声明与事实直接相反；且 SC 2.1.1 问题（指针能 seek、键盘不能）**没有被修掉，只是被隐藏** |
| 音量条 `role="meter"` | 指针可拖（可改值），键盘不可达 | **不恰当** | 音量是用户设定的输入值，不是 `scalar measurement` / gauge；meter 无 `aria-readonly`，无法表达"用户可改"；用户看到的读数语义被换成"仪表" |
| 队列/库行去掉 `tabIndex` | 不可聚焦 | 无从键盘触发 | 若行内动作（播放/打开）无其他键盘入口，同样落在 SC 2.1.1（"同等或可比操作"） |

**哪个更差**：progressbar 比 meter 更差——meter 只是"语义错位"，progressbar 是"教科书级的反向声明"（规范原文明说只读，而代码可写）。D-28 想避免"虚假无障碍声明"，结果把一个"行为未兑现的声明"换成了一个"被规范原文否定的声明"。

**最小修正（按代价从低到高）**

1. **两个都换原生 `<input type="range">`**：隐式 `role=slider`（ARIA in HTML 原文），`tabindex`/焦点/键盘由 UA 提供，指针拖动由浏览器提供；保留 `aria-label`、`aria-valuetext`（slider 适用属性允许）。CSS 用 `appearance: none` + 现有 `.dshm-progress-*` 视觉即可。
2. 若暂时不换元素：**至少要停止用 progressbar/meter 声明可交互控件**——恢复 `role="slider"` + `tabindex="0"` 并由插件处理 Arrow/Home/End（APG 模型，informative 但"advisable to treat as requirements"），**或**改成真正只读的 progressbar 并**移除指针拖动**，另给键盘可达的独立 seek 控件（±5s 按钮）。
3. 不可接受的最小改动：保留拖动 + 保留 progressbar/meter（现状）。

**关于那句结论的改写建议**：「ARIA 1.2 没有对 slider 的方向键作 MUST/SHOULD 规定（只有 APG 的 informative 键盘模型 + WAI "role is a promise"）；但一个指针可改、键盘不可达的控件违反 SC 2.1.1，而把它声明成 progressbar 会与 ARIA 原文 "always read-only" 冲突——所以应换原生 range，而不是换 role。」

## 3. 未找到 / 不推测

- **未找到**：ARIA 1.2 / WCAG 2.2 中"slider 必须支持 Arrow/Home/End/PageUp/PageDown"的 **normative 条款**（MUST 或 SHOULD）。该要求只存在于 APG（informative）。
- **未找到**：规定原生 `<input type="range">` 方向键 Step 行为的规范条文（HTML 只有 `should allow the user to change the number`），故"原生自带键盘"标注为 **UA 实现约定**。
- **未找到**：WCAG 2.2 原文中"role 必须与实际行为相符"的直接条文（只找到 W3C Understanding 的解读）。
- 未测：真实屏幕阅读器（NVDA/VoiceOver）对 `progressbar` 带 pointer 交互时的播报差异——本文件只做规范取证，未做人工测试。
