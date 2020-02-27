$(function () {
  var MAX_MODEL_DEGREE = 10;
  var modelDegree = 1;
  $('#decrement-degree').attr('disabled', 'disabled');

  var MIN_NUM_POINTS = 5;
  var MAX_NUM_POINTS = 100;
  var numPoints = parseInt($('#num-points').text(), 10);

  var $noiseSlider = $('#noise-slider');

  var margin = { top: 10, right: 10, bottom: 20, left: 40 }
  var width = $('#train-scatterplot').width() - margin.left - margin.right;
  var height = width - margin.top - margin.bottom;

  // the chart object, includes all margins
  var trainChart = d3.select('#train-scatterplot')
    .append('svg:svg')
    .attr('width', width + margin.right + margin.left)
    .attr('height', height + margin.top + margin.bottom)
    .attr('class', 'chart')

  // the main object where the chart and axis will be drawn
  var trainMain = trainChart.append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
    .attr('width', width)
    .attr('height', height)
    .attr('class', 'main')

  // the chart object, includes all margins
  var testChart = d3.select('#test-scatterplot')
    .append('svg:svg')
    .attr('width', width + margin.right + margin.left)
    .attr('height', height + margin.top + margin.bottom)
    .attr('class', 'chart')

  // the main object where the chart and axis will be drawn
  var testMain = testChart.append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
    .attr('width', width)
    .attr('height', height)
    .attr('class', 'main')

  var errorsPlot = $('#errors-plot');

  // Data
  var data = {
    // These will be shown on the plot
    trainPoints: {
      xdata: [],
      ydata: []
    },
    // These will be for evaluation purposes only
    testPoints: {
      xdata: [],
      ydata: [],
    }
  }

  var errors = {
    trainErrors: [],
    trainErrorsRaimi: [],
    testErrors: [],
  }

  // Initial noise. This is what the slider is set to.
  var randomness = 0;
  rangeSlider($noiseSlider[0], {
    value: 15,
    drag: function(value) {
      randomness = value/100;
      resetPoints();
    }
  });

  resetPoints();

  function generateParams() {
    var K = 5;
    var a = [];
    var w = [];
    var theta = [];
    var sign = Math.random() > 0.5 ? 1 : -1
    for (var i = 0; i < K; i++) {
      a.push(Math.random());
      w.push(Math.random() * 5);
      theta.push(Math.random());
    }
    return {
      K: K,
      a: a,
      w: w,
      theta: theta,
      sign: sign,
      variance: randomness
    }
  }

  function normalizeList(data) {
    var min = d3.min(data);
    var max = d3.max(data);
    result = [];
    for (var i = 0; i < data.length; i++) {
      result.push((data[i] - min) / (max - min));
    }
    return result;
  }

  function generateX(numPoints, xmin, xmax) {
    // The split between points following the polynomial and random points
    // is chosen arbitrarily, so the plot looks nice
    xmin = xmin || 0;
    xmax = xmax || 1;

    var xdata = [];

    for (var i = 0; i < numPoints; i++) {
      x = Math.random() * (xmax - xmin) + xmin;
      xdata.push(x);
    }

    return xdata;
  }

  function generateData(params, numPoints, xdata) {
    // The split between points following the polynomial and random points
    // is chosen arbitrarily, so the plot looks nice
    // xmin = xmin || 0;
    // xmax = xmax || 1;

    // var xdata = [];
    var ydata = [];
    var epsilons = [];

    // Generate the points
    // y = sum_{i=1}^K e^{a_i t} cos (w_i t + theta_i)
    // Raw f(x)
    for (var i = 0; i < numPoints; i++) {
      // x = Math.random() * (xmax - xmin) + xmin;
      // xdata.push(x);
      x = xdata[i];

      y = 0;
      for (var j = 0; j < params.K; j++) {
        y += Math.exp(params.a[j] * x) * Math.cos(params.w[j] * x + params.theta[j]);
      }
      y *= params.sign;
      ydata.push(y);
    }

    // f(x)
    ydata = normalizeList(ydata);
    fx = Array.from(ydata);
    

    // f(x) + e
    for (var i = 0; i < ydata.length; i++) {
      var epsilon = random_normal(0, params.variance);
      epsilons.push(epsilon);
      ydata[i] += epsilon;
      ydata[i] = Math.max(ydata[i], 0);
      ydata[i] = Math.min(ydata[i], 1);
    }
    console.log(fx);
    console.log(ydata);

    var avg = epsilons.reduce((a, b) => a + b, 0) / epsilons.length || 0;
    var sampleVar = epsilons.map(epsilon => (epsilon - avg) ** 2).reduce((a, b) => a + b, 0) / (epsilons.length - 1);

    $('#sigma1').text(sampleVar.toPrecision(3));
    $('#sigma2').text(randomness.toPrecision(3));


    return {
      xdata: xdata,
      ydata: ydata
    }
  }



  function resetPoints() {
    // Arbitrarily chosen variance and percentageClusteredPoints
    // There is no signficance behind the constants except that they looked good
    // with the slider.
    var numPoints = parseInt($('#num-points').text(), 10);
    var params = generateParams(numPoints);
    var xdata = generateX(numPoints);
    data.trainPoints = generateData(params, numPoints, xdata);
    data.testPoints = generateData(params, numPoints, xdata);
    errors = {
      trainErrors: [],
      testErrors: [],
    }

    resetPlot(trainMain, data.trainPoints.xdata, data.trainPoints.ydata);
    resetPlot(testMain, data.testPoints.xdata, data.testPoints.ydata);

    // Reset model degree
    modelDegree = 1;
    $('#increment-degree').removeAttr('disabled');
    $('#decrement-degree').attr('disabled', 'disabled');

    updateModelDegree();
  }

  function getFlotData(xdata, ydata) {
    flotData = [];
    for (var i = 0; i < xdata.length; i++) {
      flotData.push([xdata[i], ydata[i]]);
    }
    return flotData;
  }

  function resetPlot(main, xdata, ydata) {
    main.selectAll('*').remove();

    // x and y scales
    var x = d3.scale.linear()
      .domain([0, 1])
      // .domain([d3.min(xdata), d3.max(xdata)])  // the range of the values to plot
      .range([0, width]);        // the pixel range of the x-axis

    var y = d3.scale.linear()
      .domain([0, 1])
      // .domain([d3.min(ydata), d3.max(ydata)])
      .range([height, 0]);

    var xAxis = d3.svg.axis().scale(x).orient('bottom');
    var yAxis = d3.svg.axis().scale(y).orient('left').ticks(9);
    main.append('g').attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);
    main.append('g')
      .attr('transform', 'translate(0,0)')
      .attr("class", "y axis")
      .call(yAxis);
    // draw the graph object
    var g = main.append("svg:g");

    g.selectAll("scatter-dots")
      .data(ydata)  // using the values in the ydata array
      .enter().append("svg:circle")  // create a new circle for each value
      .attr("cy", function (d) { return y(d); }) // translate y value to a pixel
      .attr("cx", function (d, i) { return x(xdata[i]); }) // translate x value
      .attr("r", 2) // radius of circle
      .style("opacity", 1.0); // opacity of circle
  }

  function updateErrorsPlot() {
    var trainErrorsData = getErrorsData(errors.trainErrors);
    var testErrorsData = getErrorsData(errors.testErrors);
    var data = [
      {
        label: "Train",
        data: trainErrorsData
      },
      {
        label: "Test",
        data: testErrorsData
      }
    ];
    var options = {
      series: {
        lines: { show: true, fill: false },
        points: { show: true, fill: false }
      },
      xaxis: {
        min: 0,
        max: MAX_MODEL_DEGREE
      },
      yaxis: {
        min: 0,
        max: 0.5
      }
    };
    var plot = $.plot(errorsPlot, data, options)
  }

  function getErrorsData(errors) {
    errorsData = [];
    for (var i = 0; i < errors.length; i++) {
      if (errors[i] != undefined) {
        errorsData.push([i, errors[i]]);
      }
    }
    return errorsData;
  }

  function generateFit() {
    var A = getVandermonde(data.trainPoints.xdata, modelDegree);
    return backslash(A, data.trainPoints.ydata);
  }

  function plotFit2(main, points, coefficients) {
    var fitData = [];
    var xmin = d3.min(points.xdata);
    var xmax = d3.max(points.xdata);
    for (var x = xmin; x < xmax; x += 0.01) {
      var ydata = yHat(xdata, coefficients);
      fitData.push([x, ydata]);
    }
  }

  function plotFit(main, points, coefficients) {
    main.selectAll('path.regression-path').remove();
    var xmin = 0
    var xmax = 1
    var xdata = [];
    for (var x = xmin; x < xmax; x += 0.01) {
      xdata.push(x);
    }

    var ydata = yHat(xdata, coefficients);
    // x and y scales
    var x = d3.scale.linear()
      .domain([d3.min(xdata), d3.max(xdata)])  // the range of the values to plot
      .range([0, width]);        // the pixel range of the x-axis

    var y = d3.scale.linear()
      .domain([d3.min(points.ydata), d3.max(points.ydata)])
      .range([height, 0]);

    var lineFunction = d3.svg.line()
      .x(function (d, i) { return x(xdata[i]); })
      .y(function (d, i) { return y(ydata[i]); })
      .interpolate("linear");
    var lineGraph = main.append('path')
      .attr('class', 'regression-path')
      .attr('d', lineFunction(ydata))
      .attr("stroke", "blue")
      .attr("stroke-width", 2)
      .attr("fill", "none");
  }

  function rmsError(coefficients, xdata, ydata) {
    var yhat = yHat(xdata, coefficients);
    var errors = numeric.sub(ydata, yhat);
    return numeric.norm2(errors) / Math.sqrt(xdata.length);
  }

  function msError(coefficients, xdata, ydata) {
    console.log(ydata)
    var yhat = yHat(xdata, coefficients);
    var errors = numeric.sub(ydata, yhat);

    var avg = yhat.reduce((a, b) => a + b, 0) / yhat.length;
    var varYHat = yhat.map(yhat => (yhat - avg) ** 2).reduce((a, b) => a + b, 0) / (errors.length - 1);
    $('#train-variance').text(varYHat.toPrecision(3));

    var trainBias = fx.map(f => (f-avg)**2).reduce((a,b) => a+b,0) / (fx.length-1);
    var trainBiasSquared = trainBias**2;
    $('#train-bias').text(trainBiasSquared.toPrecision(3));

    return errors.map(error => error ** 2).reduce((a, b) => a + b, 0) / (errors.length - 1);
  }

  function yHat(xdata, coefficients) {
    var A = getVandermonde(xdata, coefficients.length - 1);
    return numeric.dot(A, coefficients);
  }

  function getVandermonde(xdata, degree) {
    var A = [];
    for (var i = 0; i < xdata.length; i++) {
      var row = [];
      for (var j = 0; j <= degree; j++) {
        row.push(Math.pow(xdata[i], j));
      }
      A.push(row);
    }
    return A;
  }

  function backslash(A, b) {
    // TODO: error checking (A is tall? no other types to rely on for other tests...)
    var gram = numeric.dot(numeric.transpose(A), A);
    var pinvA = numeric.dot(numeric.inv(gram), numeric.transpose(A));
    return numeric.dot(pinvA, b);
  }

  // Used for debugging
  function printArray(A) {
    for (var i = 0; i < A.length; i++) {
      console.log(A[i].join('\t'));
    }
  }

  $('.new-points').click(function () {
    resetPoints();
    $('#train-err').text('N/A');
    $('#test-err').text('N/A');
  });

  $('#increment-degree').click(function () {
    $('#decrement-degree').removeAttr('disabled');
    modelDegree += 1;
    updateModelDegree();
    if (modelDegree == MAX_MODEL_DEGREE) {
      $('#increment-degree').attr('disabled', 'disabled');
    }
  });

  $('#decrement-degree').click(function () {
    $('#increment-degree').removeAttr('disabled');
    modelDegree -= 1;
    updateModelDegree();
    if (modelDegree == 0) {
      $('#decrement-degree').attr('disabled', 'disabled');
    }
  });

  $('#increment-num-points').click(function () {
    $('#decrement-num-points').removeAttr('disabled');
    numPoints += 5;
    $('#num-points').text(numPoints);
    if (numPoints == MAX_NUM_POINTS) {
      $('#increment-num-points').attr('disabled', 'disabled');
    }
    resetPoints();
  });

  $('#decrement-num-points').click(function () {
    $('#increment-num-points').removeAttr('disabled');
    numPoints -= 5;
    $('#num-points').text(numPoints);
    if (numPoints == MIN_NUM_POINTS) {
      $('#decrement-num-points').attr('disabled', 'disabled');
    }
    resetPoints();
  });

  function updateModelDegree() {
    $('#model-degree-display').text(modelDegree);

    var coefficients = generateFit();
    // console.log(coefficients);
    plotFit(trainMain, data.trainPoints, coefficients);
    plotFit(testMain, data.testPoints, coefficients);

    trainError = msError(coefficients,
      data.trainPoints.xdata, data.trainPoints.ydata);
    $('#train-err').text(trainError.toPrecision(3));
    errors.trainErrors[modelDegree] = trainError;

    testError = rmsError(coefficients,
      data.testPoints.xdata, data.testPoints.ydata);
    $('#test-err').text(testError.toPrecision(3));
    errors.testErrors[modelDegree] = testError;

    updateErrorsPlot();
  }

  // Normal random
  function random_normal(mean, variance) {
    var normalFn = d3.random.normal(mean, variance);
    return normalFn();
  }

  function updateTextInput(val) {
    document.getElementById('textInput').value=val; 
  }

});
