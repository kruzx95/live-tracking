/**
 * MaterialIcon.jsx
 * Reusable Google Material Symbols / Material Rounded Icon component
 * Matches Icons8 Material Rounded design
 */

export default function MaterialIcon({
  name,
  size = 20,
  fill = false,
  weight = 400,
  grade = 0,
  opticalSize = 24,
  color,
  className = '',
  style = {},
  ...props
}) {
  const fontVariation = `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`;
  const sizePx = typeof size === 'number' ? `${size}px` : size;

  return (
    <span
      className={`material-symbols-rounded ${className}`.trim()}
      style={{
        fontSize: sizePx,
        width: sizePx,
        height: sizePx,
        color: color || 'inherit',
        fontVariationSettings: fontVariation,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      {name}
    </span>
  );
}
