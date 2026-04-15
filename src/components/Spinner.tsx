export default function Spinner({ size = 24 }) {
  return (
    <div
      className="inline-block animate-spin rounded-full border-2 border-gray-300 border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}
