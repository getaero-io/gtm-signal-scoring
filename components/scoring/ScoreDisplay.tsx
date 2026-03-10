interface ScoreDisplayProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreDisplay({ score, size = 'md' }: ScoreDisplayProps) {
  const getColor = (score: number) => {
    if (score >= 75) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 50) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-1.5',
    lg: 'text-2xl px-4 py-2',
  };

  return (
    <span
      className={`inline-flex items-center justify-center font-semibold rounded-full border ${getColor(
        score
      )} ${sizeClasses[size]}`}
    >
      {score}
    </span>
  );
}
