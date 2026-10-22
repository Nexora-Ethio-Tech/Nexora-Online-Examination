# Calendar and scheduling improvements

## Architecture

The existing Kewti adaptation now uses an inline, scroll-bounded seven-column calendar. Monday is the first weekday. Ethiopian months remain Amharic; all day/year digits are Latin. A bounded numeric year field commits on leaving the field; invalid years revert. Previous/Next month handles year rollover and clamps the day to the next month's length, including Pagume.

Ethiopian and Gregorian buttons change presentation without changing the underlying selected date or EAT time. The shared conversion module still validates calendar conversions. API timestamps remain UTC; clocks remain standard AM/PM in Africa/Addis_Ababa, with no six-hour clock offset.

Scheduling refreshes the server sample automatically once it reaches 45 seconds, with a 15-second retry limit. Confirmation is still blocked for a sample 60 seconds old, an expired preparation window, or invalid deadlines. A failed refresh preserves form values and explains how to reconnect. An automatic refresh never submits a schedule or extends a deadline.

## Testing

1. Open an approved paper's schedule form. Choose date, check Monday–Sunday headings and select a day. At 360px width, the calendar should stay within the form and scroll vertically when necessary.
2. Switch Ethiopian → Gregorian → Ethiopian. The selected instant, hour and AM/PM must remain unchanged. Test noon and midnight.
3. Enter a different year and leave the year field. Test Pagume 6 in Ethiopian 2015 and changing to 2016; the day must clamp to 5. Test previous/next month across New Year.
4. Leave scheduling open for over one minute while connected. School time should refresh automatically, retaining entered dates. Confirm without manually pressing Refresh server time.
5. Disconnect the backend, wait until the sample is stale, and verify confirmation remains disabled with an explanation. Restore it and wait for retry or press Refresh server time. Confirm the values are preserved.
6. Attempt a schedule whose preparation time is past or whose results time precedes the latest accommodated deadline. It must remain rejected.

Automated tests cover calendar switching, leap-day clamping, disabled fields, EAT conversion, stale clock refresh and existing deadline checks. Browser viewport checks supplement these; they do not replace testing on a real phone.
