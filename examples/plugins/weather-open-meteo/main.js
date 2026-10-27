// Example plugin: public API without a key. Only the domains declared in "permissions.network" are reachable.
var plugin = {
  // Turns the city name entered into coordinates, and checks that the city exists.
  resolve: async function (ctx) {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&name=' + encodeURIComponent(ctx.inputs.city)
    const res = await host.http(url)
    if (!res.ok) throw new Error('Geocoding unavailable (HTTP ' + res.status + ')')
    const place = (res.json().results || [])[0]
    if (!place) throw new Error('Ville introuvable : ' + ctx.inputs.city)
    return { externalId: place.latitude + ',' + place.longitude, displayName: place.name + (place.country ? ' (' + place.country + ')' : '') }
  },

  refresh: async function (ctx) {
    const coords = ctx.account.externalId.split(',')
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + coords[0] + '&longitude=' + coords[1] +
      '&current=temperature_2m,relative_humidity_2m,wind_speed_10m'
    const res = await host.http(url)
    if (!res.ok) throw new Error('Weather unavailable (HTTP ' + res.status + ')')
    const c = res.json().current
    return { metrics: { temperature: c.temperature_2m, humidity: c.relative_humidity_2m, wind: c.wind_speed_10m } }
  }
}
