(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TaptopLayerSafety = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function attributeErrors(clipboardData) {
    const errors = [];
    for (const [key, tag] of Object.entries(clipboardData?.copiedLayout?.tree?.tags || {})) {
      for (const field of ['attr', 'data']) {
        for (const name of Object.keys(tag?.[field] || {})) {
          if (name.trim().toLowerCase() === 'id') errors.push(`RESERVED_TAG_ATTRIBUTE: tag ${key} ${field}.${name} must not override Taptop's HTML id; rebuild the package and use a native anchor setting`);
        }
      }
    }
    return errors;
  }
  function assertSafe(clipboardData) {
    const errors = attributeErrors(clipboardData);
    if (errors.length) throw new Error(errors.join('; '));
  }

  // A native Taptop control keeps one number with px, %, em, rem, vw or vh, or
  // a keyword it knows; current Bridge sends anything else as a custom rule.
  // Packages from older Bridge builds wrote some such values as native rules
  // (`border-radius: 20px 20px 0 0`, found 2026-11-27), and the class sync then
  // stopped midway with "Taptop did not keep the value". Same rule as
  // `toTaptopRule` in Bridge's system/lib/css-rules.js (2026-11-27).
  const LENGTH_PROPERTIES = new Set([
    'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'top', 'right', 'bottom', 'left', 'font-size', 'letter-spacing', 'column-gap', 'row-gap', 'outline-offset',
    'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'
  ]);
  const NATIVE_LENGTH = /^(-?[\d.]+(px|%|em|rem|vw|vh)?|auto|none|normal)$/;
  const NATIVE_FONT_WEIGHT = /^([1-9]00|normal|bold)$/;
  const MATH_FUNCTION = /(^|[^a-z-])(calc|min|max|clamp)\(/i;

  function unkeepableNativeValue(property, rule) {
    if (!rule || typeof rule !== 'object' || rule.isCustom === true) return null;
    const raw = rule.value ?? rule.serializeValue;
    if (typeof raw !== 'string') return null;
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value) return null;
    if (MATH_FUNCTION.test(value)) return value;
    if (LENGTH_PROPERTIES.has(property) && !NATIVE_LENGTH.test(value)) return value;
    if (property === 'font-weight' && !NATIVE_FONT_WEIGHT.test(value)) return value;
    if (property === 'line-height' && !/^-?[\d.]+px$/.test(value)) return value;
    return null;
  }

  // Native rules of a package that Taptop would not keep: in the pasted
  // selector collections and in the class-sync rules (syncPackage).
  function staleRuleErrors(clipboardData, syncClasses = []) {
    const errors = [];
    const seen = new Set();
    const report = (selector, property, value) => {
      const key = `${selector} ${property}`;
      if (seen.has(key)) return;
      seen.add(key);
      errors.push(`PACKAGE_REBUILD_REQUIRED: ${selector} ${property}: ${value} is a native rule Taptop will not keep; rebuild the package with current Bridge`);
    };
    const layout = clipboardData?.copiedLayout || {};
    for (const collection of ['mainSelectorCollection', 'designSelectorCollection']) {
      for (const entry of Object.values(layout[collection]?.map || {})) {
        for (const [property, rule] of Object.entries(entry?.rules || {})) {
          const value = unkeepableNativeValue(property, rule);
          if (value) report(entry.selectorText || '?', property, value);
        }
      }
    }
    for (const item of Array.isArray(syncClasses) ? syncClasses : []) {
      for (const scopes of Object.values(item?.ownedRules || {})) {
        for (const [scope, rules] of Object.entries(scopes || {})) {
          const selector = scope.slice(scope.indexOf('/') + 1) || `.${item.name}`;
          for (const [property, rule] of Object.entries(rules || {})) {
            const value = unkeepableNativeValue(property, rule);
            if (value) report(selector, property, value);
          }
        }
      }
    }
    return errors;
  }

  return { attributeErrors, assertSafe, unkeepableNativeValue, staleRuleErrors };
});
