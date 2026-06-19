import React from 'react';

const StatsCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color = 'blue',
  onClick,
  trend 
}) => {
  const colorClasses = {
    blue: 'border-l-blue-500 bg-blue-50 text-blue-600',
    green: 'border-l-green-500 bg-green-50 text-green-600',
    red: 'border-l-red-500 bg-red-50 text-red-600',
    yellow: 'border-l-yellow-500 bg-yellow-50 text-yellow-600',
    purple: 'border-l-purple-500 bg-purple-50 text-purple-600'
  };

  return (
    <div 
      className={`bg-white p-6 rounded-lg border-l-4 ${colorClasses[color].split(' ')[0]} cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${
              trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
            }`}>
              <span>{trend.value}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={`p-3 rounded-full ${colorClasses[color].split(' ')[1]}`}>
            <Icon className={`text-xl ${colorClasses[color].split(' ')[2]}`} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsCard;