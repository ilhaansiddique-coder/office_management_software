import { useSystemSettingsContext } from '@/contexts/SystemSettingsContext';
import { formatDate, formatTime } from '@/lib/time';

export const useDateTime = () => {
  const { systemSettings } = useSystemSettingsContext();

  const formatDateLocal = (date: Date) => {
    return formatDate(date, systemSettings.date_format, systemSettings.timezone);
  };

  const formatTimeLocal = (date: Date) => {
    return formatTime(date, systemSettings.time_format, systemSettings.timezone);
  };

  const formatDateTime = (date: Date) => {
    return `${formatDateLocal(date)} ${formatTimeLocal(date)}`;
  };

  return {
    formatDate: formatDateLocal,
    formatTime: formatTimeLocal,
    formatDateTime,
    dateFormat: systemSettings.date_format,
    timeFormat: systemSettings.time_format,
    timezone: systemSettings.timezone,
  };
};
