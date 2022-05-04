var data={
    input:{
        workers:{
            names:['w0','w1','w2','w3','w4']
        },
        jobs:{
            names:['0.0','0.1','0.2','1.0','1.1','1.2','2.0','2.1','2.2','2.3'],
            deps:[[0,1],[1,2],[3,4],[4,5],[6,7],[7,8],[8,9]], // `deps[k][pj][j]` means the `k`th dependency is job `pj` precedes job `j`. 
            exes:[ // `exes[j][w]` is the duration of executing job `j` on one of its compatible worker `w`.
                {0:1,1:2},
                {1:1},
                {2:1},
                {3:1},
                {4:1},
                {0:1},
                {1:2},
                {2:3},
                {3:4},
                {4:5}
            ]
        }
    },
    output:{
        makespan:20,
        assignments:[0,1,3,3,4,0,1,2,3,4],
        beginTimes:[0,1,3,5,7,9,3,5,7,9]
    }
}