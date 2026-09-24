import type { FieldAlert, Recommendation } from '@/domain/types';
import type { Locale } from './i18n';

const titles: Record<Locale, Record<Recommendation['status'], string>> = {
  en: { irrigate: 'Irrigation recommended today', 'wait-for-rain': 'Waiting for expected rainfall', monitor: 'Your field can wait', blocked: 'Irrigation needs attention', irrigating: 'Irrigation in progress', complete: 'Irrigation plan completed' },
  uz: { irrigate: 'Bugun sugʻorish tavsiya etiladi', 'wait-for-rain': 'Kutilayotgan yogʻin kuzatilmoqda', monitor: 'Hozircha sugʻorish shart emas', blocked: 'Sugʻorishdan oldin tekshiruv kerak', irrigating: 'Sugʻorish davom etmoqda', complete: 'Sugʻorish rejasi yakunlandi' },
  ru: { irrigate: 'Сегодня рекомендуется полив', 'wait-for-rain': 'Ожидаем прогнозируемые осадки', monitor: 'Пока можно не поливать', blocked: 'Перед поливом нужна проверка', irrigating: 'Полив идёт', complete: 'План полива выполнен' },
};

const reasons: Record<Locale, Record<string, string>> = {
  en: {},
  uz: {
    'The root zone has reached its action threshold. Refill to the configured management target.': 'Ildiz zonasidagi suv tanqisligi sugʻorish chegarasiga yetdi. Suvni belgilangan maqsadgacha toʻldiring.',
    'The field has enough available water. Continue monitoring soil and rainfall.': 'Daladagi suv hozircha yetarli. Tuproq va yogʻinni kuzatishda davom eting.',
    'The no-rain projection reaches the action threshold before the forecast window ends. Plan irrigation before relying on that rainfall.': 'Yogʻin tushmasa, dala prognoz davri tugashidan oldin sugʻorish chegarasiga yetadi. Yomgʻirga tayanishdan oldin sugʻorishni rejalang.',
    'The field can safely wait through the entire forecast window, even if no rain arrives. Only observed rain will change the water balance.': 'Yogʻin tushmasa ham dala butun prognoz davrida xavfsiz holatda qoladi. Suv balansini faqat kuzatilgan yogʻin oʻzgartiradi.',
    'Rain was lower than expected: 2.0 mm received against 7.0 mm forecast. The remaining root-zone need determines this plan.': 'Yogʻin kutilganidan kam boʻldi: 7,0 mm prognozga qarshi 2,0 mm tushdi. Reja ildiz zonasidagi qolgan ehtiyojga asoslanadi.',
    'Simulated delivery is integrating from zone flow. Volume, rather than a timer, determines completion.': 'Modellashtirilgan suv hududlardagi oqim boʻyicha hisoblanmoqda. Yakunlanishni vaqt emas, yetkazilgan hajm belgilaydi.',
    'The field’s water need is covered by observed rain and simulated actual delivery. The water balance has been updated.': 'Dalaning suv ehtiyoji kuzatilgan yogʻin va modellashtirilgan yetkazish bilan qoplandi. Suv balansi yangilandi.',
  },
  ru: {
    'The root zone has reached its action threshold. Refill to the configured management target.': 'Дефицит влаги в корневой зоне достиг порога полива. Пополните воду до заданной цели.',
    'The field has enough available water. Continue monitoring soil and rainfall.': 'Пока в поле достаточно доступной воды. Продолжайте следить за почвой и осадками.',
    'The no-rain projection reaches the action threshold before the forecast window ends. Plan irrigation before relying on that rainfall.': 'Если дождя не будет, поле достигнет порога полива до конца периода прогноза. Запланируйте полив, прежде чем рассчитывать на дождь.',
    'The field can safely wait through the entire forecast window, even if no rain arrives. Only observed rain will change the water balance.': 'Поле может безопасно ждать весь период прогноза, даже без дождя. Водный баланс изменят только наблюдаемые осадки.',
    'Rain was lower than expected: 2.0 mm received against 7.0 mm forecast. The remaining root-zone need determines this plan.': 'Осадков оказалось меньше прогноза: выпало 2,0 мм вместо 7,0 мм. План основан на оставшейся потребности корневой зоны.',
    'Simulated delivery is integrating from zone flow. Volume, rather than a timer, determines completion.': 'Смоделированная подача рассчитывается по расходу зон. Завершение зависит от объёма воды, а не только от времени.',
    'The field’s water need is covered by observed rain and simulated actual delivery. The water balance has been updated.': 'Потребность поля покрыта наблюдаемыми осадками и смоделированной подачей. Водный баланс обновлён.',
  },
};

export function recommendationText(recommendation: Recommendation, locale: Locale) {
  if (locale === 'en') return { title: recommendation.title, reason: recommendation.reason };
  const prefix = 'Explicit zone soil accounting: ';
  const zone = recommendation.reason.startsWith(prefix);
  const raw = zone ? recommendation.reason.slice(prefix.length) : recommendation.reason;
  const translated = reasons[locale][raw] ?? raw;
  return { title: titles[locale][recommendation.status], reason: zone ? `${locale === 'uz' ? 'Hududlar tuprogʻi alohida hisoblangan: ' : 'Почва зон рассчитана отдельно: '}${translated}` : translated };
}

const labels: Record<'uz' | 'ru', Record<string, string>> = {
  uz: { 'North Potato Field': 'Shimoliy kartoshka dalasi', 'Tashkent Demo Farm': 'Toshkent namoyish dalasi', 'Mid-season': 'Oʻrta oʻsish davri', Complete: 'Toʻliq', Moderate: 'Oʻrtacha', Degraded: 'Yetarli emas', online: 'Ishlayapti', offline: 'Ulanmagan', warning: 'Ogohlantirish', valid: 'Yaroqli', stale: 'Eskirgan', outlier: 'Gʻayrioddiy', conflict: 'Mos emas', active: 'Faol', idle: 'Kutmoqda', running: 'Ishlayapti', paused: 'Toʻxtatib turilgan', stopped: 'Toʻxtatilgan', completed: 'Yakunlangan', fault: 'Nosozlik', OPEN: 'Ochiq', CLOSED: 'Yopiq', FAILED: 'Nosoz', OFF: 'Oʻchiq', ON: 'Yoniq' },
  ru: { 'North Potato Field': 'Северное картофельное поле', 'Tashkent Demo Farm': 'Демонстрационное поле в Ташкенте', 'Mid-season': 'Середина сезона', Complete: 'Полные', Moderate: 'Средние', Degraded: 'Недостаточные', online: 'В сети', offline: 'Не в сети', warning: 'Предупреждение', valid: 'Корректно', stale: 'Устарело', outlier: 'Выброс', conflict: 'Несоответствие', active: 'Активно', idle: 'Ожидание', running: 'Работает', paused: 'Приостановлено', stopped: 'Остановлено', completed: 'Завершено', fault: 'Неисправность', OPEN: 'Открыт', CLOSED: 'Закрыт', FAILED: 'Сбой', OFF: 'Выключен', ON: 'Включён' },
};
const technicalLabels: Record<Locale, Record<string, string>> = {
  en: { weather: 'Weather station', rain: 'Rain gauge', soil: 'Soil sensor', flow: 'Flow meter', pressure: 'Pressure sensor', valve: 'Valve', pump: 'Pump', SIMULATED: 'Simulated', MEASURED: 'Measured', crop: 'Crop', policy: 'Policy', irrigation: 'Irrigation', simulation: 'Simulation' },
  uz: { weather: 'Ob-havo stansiyasi', rain: 'Yogʻin oʻlchagich', soil: 'Tuproq sensori', flow: 'Oqim oʻlchagich', pressure: 'Bosim sensori', valve: 'Klapan', pump: 'Nasos', SIMULATED: 'Modellashtirilgan', MEASURED: 'Oʻlchangan', crop: 'Ekin', policy: 'Boshqaruv qoidasi', irrigation: 'Sugʻorish', simulation: 'Model' },
  ru: { weather: 'Метеостанция', rain: 'Дождемер', soil: 'Датчик почвы', flow: 'Расходомер', pressure: 'Датчик давления', valve: 'Клапан', pump: 'Насос', SIMULATED: 'Смоделированные', MEASURED: 'Измеренные', crop: 'Культура', policy: 'Правила управления', irrigation: 'Полив', simulation: 'Модель' },
};
export function displayLabel(value: string, locale: Locale) { return technicalLabels[locale][value] ?? (locale === 'en' ? value : labels[locale][value] ?? value); }
export function displayDeviceName(name: string, locale: Locale) {
  if (locale === 'en') return name;
  const simple: Record<'uz' | 'ru', Record<string, string>> = {
    uz: { 'Weather station': 'Ob-havo stansiyasi', 'Rain gauge': 'Yogʻin oʻlchagich', 'Main flow meter': 'Asosiy suv oqimi oʻlchagichi', 'Pressure sensor': 'Bosim sensori', 'Pump controller': 'Nasos boshqaruvi' },
    ru: { 'Weather station': 'Метеостанция', 'Rain gauge': 'Дождемер', 'Main flow meter': 'Основной расходомер', 'Pressure sensor': 'Датчик давления', 'Pump controller': 'Управление насосом' },
  };
  if (simple[locale][name]) return simple[locale][name];
  const soil = /^Soil moisture · (\d+) cm$/.exec(name);
  if (soil) return locale === 'uz' ? `Tuproq namligi · ${soil[1]} sm` : `Влажность почвы · ${soil[1]} см`;
  const valve = /^Valve ([A-D])$/.exec(name);
  if (valve) return locale === 'uz' ? `${valve[1]}-klapan` : `Клапан ${valve[1]}`;
  return name;
}
export function displayConfidence(value: string, locale: Locale) {
  const texts = {
    en: { Complete: 'Complete data', Moderate: 'Moderate data', Degraded: 'Degraded data' },
    uz: { Complete: 'Maʼlumotlar toʻliq', Moderate: 'Maʼlumotlar qisman', Degraded: 'Maʼlumotlar yetarli emas' },
    ru: { Complete: 'Данные полные', Moderate: 'Данные частичные', Degraded: 'Данных недостаточно' },
  } as const;
  return texts[locale][value as keyof typeof texts.en] ?? value;
}

const alertText: Record<'uz' | 'ru', Record<string, [string, string]>> = {
  uz: {
    RAIN_UNDER_FORECAST: ['Yogʻin kutilganidan kam boʻldi', 'Dala balansiga faqat kuzatilgan yogʻin kiradi. Bugungi sugʻorish rejasi qolgan ehtiyojni qoplaydi.'],
    UNEXPECTED_RAIN: ['Kutilmagan yogʻin', 'Kuzatilgan yogʻin sugʻorish ehtiyojini kamaytirmoqda.'],
    VALVE_FAILURE: ['Klapan ochilmadi', 'Ochish buyrugʻi tasdiqlanmadi. Avtomatik suv yetkazish toʻxtatib turildi.'],
    SENSOR_OFFLINE: ['40 sm tuproq sensori ulanmagan', 'Suv balansi modeli ishlayapti, ammo maʼlumotlar toʻliqligi pasaydi.'],
    SENSOR_OUTLIER: ['Shubhali tuproq koʻrsatkichi chiqarib tashlandi', '97,8% koʻrsatkich tekshiruv uchun saqlandi va boshqaruvda ishlatilmadi.'],
    TELEMETRY_CONFLICT: ['Suv oqimi boshqaruv holatiga mos emas', '12 m³/soat oqim yopiq klapanlar va oʻchiq nasos holatiga mos kelmaydi.'],
    ROOT_ZONE_STRESS: ['Ildiz zonasi sugʻorish chegarasiga yetdi', 'Belgilangan tuproq suvi maqsadiga qaytish uchun hozirgi tavsiyadan foydalaning.'],
    ROOT_ZONE_NEAR_STRESS: ['Ildiz zonasi sugʻorish chegarasiga yaqin', 'Prognoz va keyingi sugʻorish tavsiyasini kuzating.'],
  },
  ru: {
    RAIN_UNDER_FORECAST: ['Осадков меньше прогноза', 'В баланс поля входят только наблюдаемые осадки. План полива покрывает оставшуюся потребность.'],
    UNEXPECTED_RAIN: ['Неожиданные осадки', 'Наблюдаемые осадки снижают потребность в поливе.'],
    VALVE_FAILURE: ['Клапан не открылся', 'Команда открытия не подтверждена. Автоматическая подача приостановлена.'],
    SENSOR_OFFLINE: ['Датчик почвы на 40 см не в сети', 'Модель водного баланса доступна, но полнота данных снизилась.'],
    SENSOR_OUTLIER: ['Сомнительное показание почвы исключено', 'Показание 97,8% сохранено для проверки и не используется в управлении.'],
    TELEMETRY_CONFLICT: ['Расход воды не соответствует состоянию системы', 'Расход 12 м³/ч не согласуется с закрытыми клапанами и выключенным насосом.'],
    ROOT_ZONE_STRESS: ['Корневая зона достигла порога полива', 'Используйте текущую рекомендацию, чтобы вернуться к заданной цели по воде в почве.'],
    ROOT_ZONE_NEAR_STRESS: ['Корневая зона приближается к порогу', 'Следите за прогнозом и следующей рекомендацией по поливу.'],
  },
};
export function displayAlert(alert: FieldAlert, locale: Locale) {
  if (locale === 'en') return { title: alert.title, message: alert.message };
  const translated = alertText[locale][alert.type];
  return translated ? { title: translated[0], message: translated[1] } : { title: alert.title, message: alert.message };
}

const scenarioNames: Record<'uz' | 'ru', Record<string, string>> = {
  uz: { 'normal-hot-day': 'Oddiy issiq kun', 'rain-succeeds': 'Prognozdagi yogʻin tushdi', 'rain-fails': 'Prognozdagi yogʻin tushmadi', 'rain-underperforms': 'Yogʻin kutilganidan kam', 'unexpected-storm': 'Kutilmagan kuchli yogʻin', 'high-flow': 'Suv oqimi yuqori', 'low-flow': 'Suv oqimi past', 'low-pressure': 'Bosim past', 'sensor-offline': 'Tuproq sensori ulanmagan', 'sensor-outlier': 'Shubhali sensor koʻrsatkichi', 'valve-failure': 'Klapan buyrugʻi bajarilmadi', 'telemetry-conflict': 'Telemetriya mos emas' },
  ru: { 'normal-hot-day': 'Обычный жаркий день', 'rain-succeeds': 'Дождь по прогнозу', 'rain-fails': 'Дождь не пришёл', 'rain-underperforms': 'Осадков меньше прогноза', 'unexpected-storm': 'Неожиданный ливень', 'high-flow': 'Высокий расход', 'low-flow': 'Низкий расход', 'low-pressure': 'Низкое давление', 'sensor-offline': 'Датчик почвы не в сети', 'sensor-outlier': 'Сомнительное показание датчика', 'valve-failure': 'Сбой команды клапана', 'telemetry-conflict': 'Несоответствие телеметрии' },
};
export function displayScenario(id: string, fallbackName: string, locale: Locale) { return locale === 'en' ? fallbackName : scenarioNames[locale][id] ?? fallbackName; }

const events: Record<'uz' | 'ru', Record<string, string>> = {
  uz: {
    'Irrigation stopped. Delivered volume remains in the field balance.': 'Sugʻorish toʻxtatildi. Yetkazilgan suv dala balansida qoldi.',
    'Irrigation paused by the operator.': 'Sugʻorish operator tomonidan toʻxtatib turildi.',
    'Critical device data prevents control.': 'Muhim qurilma maʼlumotlari yetishmagani uchun boshqaruv bloklandi.',
    'No irrigation is currently required.': 'Hozir sugʻorish talab qilinmaydi.',
    'Sequential irrigation started: A → B → C → D.': 'Ketma-ket sugʻorish boshlandi: A → B → C → D.',
    'Irrigation resumed.': 'Sugʻorish davom ettirildi.',
    'Observed rain paused irrigation; the remaining plan will be reassessed.': 'Kuzatilgan yogʻin sugʻorishni toʻxtatib turdi; qolgan reja qayta hisoblanadi.',
    'Rain event closed after the configured dry interval.': 'Belgilangan quruq davrdan keyin yogʻin hodisasi yakunlandi.',
    'Forecast and observation reconciled without changing observed rainfall.': 'Prognoz va kuzatuv solishtirildi; kuzatilgan yogʻin oʻzgartirilmadi.',
    'Rain supplied the remaining need; the irrigation plan was cancelled.': 'Qolgan ehtiyojni yogʻin qopladi; sugʻorish rejasi bekor qilindi.',
    'A new daily ET budget was computed from the versioned scientific engine.': 'Versiyalangan hisoblash tizimi yangi kunlik ET miqdorini hisobladi.',
    'All four zones completed their target volume.': 'Toʻrt hudud ham belgilangan suv hajmini oldi.',
  },
  ru: {
    'Irrigation stopped. Delivered volume remains in the field balance.': 'Полив остановлен. Поданная вода остаётся в балансе поля.',
    'Irrigation paused by the operator.': 'Оператор приостановил полив.',
    'Critical device data prevents control.': 'Нет необходимых данных устройств для управления.',
    'No irrigation is currently required.': 'Сейчас полив не требуется.',
    'Sequential irrigation started: A → B → C → D.': 'Последовательный полив начат: A → B → C → D.',
    'Irrigation resumed.': 'Полив возобновлён.',
    'Observed rain paused irrigation; the remaining plan will be reassessed.': 'Наблюдаемый дождь приостановил полив; оставшийся план будет пересчитан.',
    'Rain event closed after the configured dry interval.': 'Событие дождя завершено после заданного сухого периода.',
    'Forecast and observation reconciled without changing observed rainfall.': 'Прогноз и наблюдения сверены без изменения фактических осадков.',
    'Rain supplied the remaining need; the irrigation plan was cancelled.': 'Дождь покрыл оставшуюся потребность; план полива отменён.',
    'A new daily ET budget was computed from the versioned scientific engine.': 'Расчётный модуль вычислил новую дневную величину ET.',
    'All four zones completed their target volume.': 'Все четыре зоны получили заданный объём воды.',
  },
};
export function displayEvent(message: string, locale: Locale) {
  if (locale === 'en') return message;
  if (events[locale][message]) return events[locale][message];
  const zone = /^Zone ([A-D]) delivered its target volume\.$/.exec(message);
  if (zone) return locale === 'uz' ? `${zone[1]}-hudud belgilangan suv hajmini oldi.` : `Зона ${zone[1]} получила заданный объём воды.`;
  const initialized = /^(.+) initialized\. All device data is simulated\.$/.exec(message);
  if (initialized) {
    const id = Object.entries({ 'Normal hot day': 'normal-hot-day', 'Forecast rain succeeds': 'rain-succeeds', 'Forecast rain fails': 'rain-fails', 'Rain underperforms': 'rain-underperforms', 'Unexpected storm': 'unexpected-storm', 'High flow': 'high-flow', 'Low flow': 'low-flow', 'Low pressure': 'low-pressure', 'Soil sensor offline': 'sensor-offline', 'Soil sensor outlier': 'sensor-outlier', 'Valve command failure': 'valve-failure', 'Telemetry conflict': 'telemetry-conflict' }).find(([name]) => name === initialized[1])?.[1];
    const name = id ? scenarioNames[locale][id] : initialized[1];
    return locale === 'uz' ? `${name} ssenariysi boshlandi. Barcha qurilma maʼlumotlari modellashtirilgan.` : `Сценарий «${name}» запущен. Все данные устройств смоделированы.`;
  }
  return message;
}
