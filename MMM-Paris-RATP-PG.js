/* Timetable for Paris local transport Module */

/* Magic Mirror
 * Module: MMM-Paris-RATP-PG
 *
 * By da4throux
 * based on a script from Georg Peters (https://lane6.de)
 * and a script from Benjamin Angst http://www.beny.ch
 * MIT Licensed.
 */

Module.register("MMM-Paris-RATP-PG",{

  // Define module defaults
  defaults: {
    animationSpeed: 2000,
    debug: false, //console.log more things to help debugging
    autolib_api: 'https://opendata.paris.fr/explore/dataset/stations_et_espaces_autolib_de_la_metropole_parisienne/api/', ///add '?q=' mais pas d'info temps réel... pour l'instant
    pluie_api:  'http://www.meteofrance.com/mf3-rpc-portlet/rest/pluie/',
    ratp_api: 'https://api-ratp.pierre-grimaud.fr/v3/',
    autolib_api: 'https://opendata.paris.fr/api/records/1.0/search/?dataset=autolib-disponibilite-temps-reel&refine.public_name=',
    conversion: { "Trafic normal sur l'ensemble de la ligne." : 'Traffic OK'},
    pluieIconConverter: {
      "Pas de précipitations" : 'wi-day-cloudy',
      "Précipitations faibles": 'wi-day-showers',
      "Précipitations modérés": 'wi-day-rain',
      "Précipidations fortes": 'wi-day-storm-showers',
    },
    pluieIconColors: {
      "Pas de précipitations" : 'blue',
      "Précipitations faibles": 'yellow',
      "Précipitations modérés": 'orange',
      "Précipidations fortes": 'red',
    },
    line_template: {
      updateInterval: 1 * 60 * 1000,
      maximumEntries: 2, //if the APIs sends several results for the incoming transport how many should be displayed
      maxLettersForDestination: 22, //will limit the length of the destination string
      convertToWaitingTime: true, // messages received from API can be 'hh:mm' in that case convert it in the waiting time 'x mn'
      concatenateArrivals: true, //if for a transport there is the same destination and several times, they will be displayed on one line
      initialLoadDelay: 0, // start delay seconds
      showUpdateAge: true,
      pluieAsText: false
    },
  },

  // Define required scripts.
  getStyles: function() {
    return ["MMM-Paris-RATP-Transport.css", "font-awesome.css", "weather-icons.css"];
  },

  // Define start sequence.
  start: function() {
    var l;
    Log.info("Starting module: " + this.name);
    this.config.infos = [];
    if (!this.config.lines) {
      this.config.lines = [];
    }
    for (i=0; i < this.config.lines.length; i++) {
      this.config.infos[i]={};
      l = Object.assign(JSON.parse(JSON.stringify(this.config.line_template)),
        JSON.parse(JSON.stringify(this.config.lines[i])));
      l.id = i;
      switch (l.type) {
        case 'tramways':
        case 'bus':
        case 'rers':
        case 'metros':
          l.url = this.config.ratp_api + 'schedules/' + l.type + '/' + l.line.toString().toLowerCase() + '/' + l.stations + '/' + l.destination; // get schedule for that bus
          break;
        case 'traffic':
          l.url = this.config.ratp_api + 'traffic/' +l.line[0] + '/' + l.line[1];
          break;
        case 'pluie':
          l.url = this.config.pluie_api + l.place;
          break;
        default:
          if (this.config.debug) { console.log('Unknown request type: ' + l.type)}
      }
      this.config.lines[i] = l;
    }
    this.sendSocketNotification('SET_CONFIG', this.config);
    this.loaded = false;
    var self = this;
    setInterval(function () {
      self.caller = 'updateInterval';
      self.updateDom();
    }, 1000);
  },

  getHeader: function () {
    var header = this.data.header;
    return header;
  },

  // Override dom generator.
  getDom: function() {
    var now = new Date();
    var wrapper = document.createElement("div");
    var lines = this.config.lines;
    var i, j, l, d, n, firstLine, delta, lineColor;
    var table = document.createElement("table");
    var stopIndex, firstCell, secondCell;
    var previousRow, previousDestination, previousMessage, row, comingBus, iconSize, nexts;
    if (lines.length > 0) {
      if (!this.loaded) {
        wrapper.innerHTML = "Loading connections ...";
        wrapper.className = "dimmed light small";
        return wrapper;
      } else {
        wrapper.className = "paristransport";
        wrapper.appendChild(table);
        table.className = "small";
      }
    } else {
      wrapper.className = "small";
      wrapper.innerHTML = "Configuration now requires a 'lines' element.<br />Check github da4throux/MMM-Paris-RATP-PG<br />for more information";
    }
    for (i = 0; i < lines.length; i++) {
      l = lines[i]; // line config
      d = this.infos[i]; // data received for the line
      firstLine =  true;
      firstCellHeader = '';
      if ((new Date() - Date.parse(d.lastUpdate) )/ 1000 > 0 && l.showUpdateAge) {
        delta = Math.floor((new Date() - Date.parse(d.lastUpdate) )/ 1000 / 10);
        if (delta <= 20) {
          firstCellHeader += '&#' + (9312 + delta) + ';';
        } else if (delta > 20) {
          firstCellHeader += '&#9471;';
        }
      }
      lineColor = l.lineColor ? 'color:' + l.lineColor + ' !important' : false;
      switch (l.type) {
        case "traffic":
          row = document.createElement("tr");
          row.id = 'line-' + i;
          firstCell = document.createElement("td");
          firstCell.className = "align-right bright";
          firstCell.innerHTML = firstCellHeader + (l.label || l.line[1]);
          if (lineColor) {
              firstCell.setAttribute('style', lineColor);
          }
          if (l.firstCellColor) {
              firstCell.setAttribute('style', 'color:' + l.firstCellColor + ' !important');
          }
          row.appendChild(firstCell);
          secondCell = document.createElement("td");
          secondCell.className = "align-left";
          secondCell.innerHTML = d.status ? this.config.conversion[d.status.message] || d.status.message : 'N/A';
          secondCell.colSpan = 2;
          if (lineColor) {
              secondCell.setAttribute('style', lineColor);
          }
          row.appendChild(secondCell);
          table.appendChild(row);
          break;
        case "bus":
        case "metros":
        case "tramways":
        case "rers":
          nexts = d.schedules || [{message: 'N/A', destination: 'N/A'}];
          for (var rank = 0; (rank < l.maximumEntries) && (rank < nexts.length); rank++) {
            n = nexts[rank]; //next transport
            row = document.createElement("tr");
            row.id = 'line-' + i + '-' + 'rank';
            var firstCell = document.createElement("td");
            firstCell.className = "align-right bright";
            firstCell.innerHTML = firstLine ? firstCellHeader + (l.label || l.line) : ' ';
            if (lineColor) {
              firstCell.setAttribute('style', lineColor);
            }
            if (l.firstCellColor) {
              firstCell.setAttribute('style', 'color:' + l.firstCellColor + ' !important');
            }
            row.appendChild(firstCell);
            var busDestinationCell = document.createElement("td");
            busDestinationCell.innerHTML = n.destination.substr(0, l.maxLettersForDestination);
            busDestinationCell.className = "align-left";
            if (lineColor) {
              busDestinationCell.setAttribute('style', lineColor);
            }
            row.appendChild(busDestinationCell);
            var depCell = document.createElement("td");
            depCell.className = "bright";
            if (l.convertToWaitingTime && /^\d{1,2}[:][0-5][0-9]$/.test(n.message)) {
              var transportTime = n.message.split(':');
              var trainDate = new Date(0, 0, 0, transportTime[0], transportTime[1]);
              var startDate = new Date(0, 0, 0, now.getHours(), now.getMinutes(), now.getSeconds());
              var waitingTime = trainDate - startDate;
              if (startDate > trainDate ) {
                if (startDate - trainDate < 1000 * 60 * 2) {
                  waitingTime = 0;
                } else {
                  waitingTime += 1000 * 60 * 60 * 24;
                }
              }
              waitingTime = Math.floor(waitingTime / 1000 / 60);
              depCell.innerHTML = waitingTime + ' mn';
            } else {
              depCell.innerHTML = n.message;
            }
            depCell.innerHTML = depCell.innerHTML.substr(0, l.maxLettersForTime);
            if (lineColor) {
              depCell.setAttribute('style', lineColor);
            }
            row.appendChild(depCell);
            if (l.concatenateArrivals && !firstLine && (n.destination == previousDestination)) {
              previousMessage += ' / ' + depCell.innerHTML;
              previousRow.getElementsByTagName('td')[2].innerHTML = previousMessage;
            } else {
              table.appendChild(row);
              previousRow = row;
              previousMessage = depCell.innerHTML;
              previousDestination = n.destination;
            }
            firstLine = false;
          }
          break;
        case "pluie":
          row = document.createElement("tr");
          row.id = 'line-' + i;
          firstCell = document.createElement("td");
          firstCell.className = "align-right bright";
          firstCell.innerHTML = firstCellHeader + (l.label || l.place);
          if (lineColor) {
            firstCell.setAttribute('style', lineColor);
          }
          if (l.firstCellColor) {
            firstCell.setAttribute('style', 'color:' + l.firstCellColor + ' !important');
          }
          row.appendChild(firstCell);
          secondCell = document.createElement("td");
          secondCell.colSpan = 2;
          if (lineColor) {
            secondCell.setAttribute('style', lineColor);
          }
          if (l.pluieAsText) {
            secondCell.className = "align-left";
            secondCell.innerHTML = d.niveauPluieText.join('</br>');
          } else {
            secondCell.className = "align-center";
            secondCell.innerHTML = '';
            iconSize = l.iconSize ? "font-size: " + l.iconSize + "em" : "";
            for (j = 0; j < d.dataCadran.length; j++) {
              var iconColor = '';
              iconColor = l.pluieNoColor ? '' : 'color:' + this.config.pluieIconColors[d.dataCadran[j].niveauPluieText] + ' !important;';
              secondCell.innerHTML += '<i id="' + l.place + 'pluie' + j + '" class="wi ' + this.config.pluieIconConverter[d.dataCadran[j].niveauPluieText] + '" style="' + iconSize+ ';' + iconColor + '"></i>';
            }
          }
          row.appendChild(secondCell);
          table.appendChild(row);
          break;
        default:
          if (this.config.debug) { console.log('Unknown request type: ' + l.type)}
      }
    }
    return wrapper;
  },

  socketNotificationReceived: function(notification, payload) {
    var maxVelibArchiveAge = this.config.velibTrendDay ? 24 * 60 * 60 : this.config.velibTrendTimeScale || 60 * 60;
    var velibArchiveCleaned = 0;
    var now = new Date();
    this.caller = notification;
    switch (notification) {
      case "DATA":
        this.infos = payload;
        this.loaded = true;
        break;
    }
  }
});
