package body Hood.City.Varied is

   Cell_Pitch : constant Long_Float := 54.0;  --  constants.ts:14
   Street_W   : constant Long_Float := 14.0;  --  constants.ts:13
   Inset      : constant := 3;                --  cityLayout.ts:258
   Centre     : constant := 4;                --  the centre lot (world.ts)

   --  Scratch, package level so that nothing large sits on the stack.
   Reserved : array (Integer_32 range 0 .. Max_Blocks - 1) of Boolean;
   Placed   : array (Integer_32 range 0 .. Max_Buildings - 1) of Boolean;
   Cand     : Hood.Random.Index_List (1 .. Max_Blocks);
   Avail    : Hood.Random.Index_List (1 .. Max_Lots);
   Weights  : Hood.Random.Weight_List (1 .. Type_Count);
   Choices  : array (1 .. Type_Count) of Listed_Type;

   --  Block predicates of the reservations and landmarks.
   type Where is
     (Anywhere, Not_Industrial, Civic_Or_Downtown, Industrial_Only,
      Civic_Only, Civic_Or_Commercial, Residential_Or_Civic,
      Residential_Only, Industrial_Or_Civic, Downtown_Only, Not_Downtown,
      Downtown_Or_Civic, Corner_1, Corner_2, Corner_3, Corner_4);

   function Holds (C : City_State; B : Block_Rec; P : Where) return Boolean is
      Half_W : constant Integer_32 := C.W / 2;
      Half_H : constant Integer_32 := C.H / 2;
   begin
      return
        (case P is
            when Anywhere            => True,
            when Not_Industrial      => B.Area /= Industrial,
            when Civic_Or_Downtown   => B.Area in Civic | Downtown,
            when Industrial_Only     => B.Area = Industrial,
            when Civic_Only          => B.Area = Civic,
            when Civic_Or_Commercial => B.Area in Civic | Commercial,
            when Residential_Or_Civic => B.Area in Residential | Civic,
            when Residential_Only    => B.Area = Residential,
            when Industrial_Or_Civic => B.Area in Industrial | Civic,
            when Downtown_Only       => B.Area = Downtown,
            when Not_Downtown        => B.Area /= Downtown,
            when Downtown_Or_Civic   => B.Area in Downtown | Civic,
            when Corner_1 => B.GX < Half_W and then B.GY < Half_H and then B.Area /= Industrial,
            when Corner_2 => B.GX >= Half_W and then B.GY < Half_H and then B.Area /= Industrial,
            when Corner_3 => B.GX < Half_W and then B.GY >= Half_H and then B.Area /= Industrial,
            when Corner_4 => B.GX >= Half_W and then B.GY >= Half_H and then B.Area /= Industrial);
   end Holds;

   --  citygen.ts:153-172. r < 0.28, 0.42, 0.72 compared exactly: with
   --  A = (2gx - w + 1) h and B = (2gy - h + 1) w, r * r = (A*A + B*B) /
   --  (w h)**2. Every exact tie (sizes with a side of 25, on an axis) has
   --  r exactly 0.72 in floating point too, where 1.2.91's "<" is false.
   function District_For (GX, GY, W, H, Edge : Integer_32) return District is
      A : constant Integer_64 := Integer_64 (2 * GX - W + 1) * Integer_64 (H);
      B : constant Integer_64 := Integer_64 (2 * GY - H + 1) * Integer_64 (W);
      R2 : constant Integer_64 := 10_000 * (A * A + B * B);
      D  : constant Integer_64 := (Integer_64 (W) * Integer_64 (H)) ** 2;
   begin
      if (Edge = 0 and then GY <= 1) or else (Edge = 1 and then GX >= W - 2)
        or else (Edge = 2 and then GY >= H - 2) or else (Edge = 3 and then GX <= 1)
      then
         return Industrial;
      elsif R2 < 784 * D then
         return Downtown;
      elsif R2 < 1_764 * D then
         return Civic;
      elsif R2 < 5_184 * D then
         return Commercial;
      else
         return Residential;
      end if;
   end District_For;

   --  hash.ts:17-29
   function Rint (Id : Integer_32; Salt : Unsigned_32; N : Unsigned_32) return Integer_32 is
     (Integer_32 (Hood.Random.Hash32
        ((Unsigned_32 (Id) * 2_654_435_761) xor ((Salt + 1) * 40_503)) mod N));

   procedure Reserve
     (C : in out City_State; GX, GY, SX, SY : Integer_32; Use_As : Block_Use;
      Name, Landmark : Integer_32; Done : out Boolean)
   is
      Root : constant Integer_32 := GY * C.W + GX;
      RX, RY, RW, RH, Width, Height, CX, CY : Long_Float;
      Lot : Integer_32;
   begin
      Done := False;
      if GX < 0 or else GY < 0 or else GX + SX > C.W or else GY + SY > C.H then
         return;
      end if;
      for Y in GY .. GY + SY - 1 loop
         for X in GX .. GX + SX - 1 loop
            if Reserved (Y * C.W + X) then
               return;
            end if;
         end loop;
      end loop;
      for Y in GY .. GY + SY - 1 loop
         for X in GX .. GX + SX - 1 loop
            Reserved (Y * C.W + X) := True;
            C.Blocks (Y * C.W + X).Use_Of := Use_As;
            if Y * C.W + X /= Root then
               C.Blocks (Y * C.W + X).Merged_Into := Root;
            end if;
         end loop;
      end loop;
      C.Blocks (Root).Span_X := SX;
      C.Blocks (Root).Span_Y := SY;
      C.Blocks (Root).Name := Name;
      C.Blocks (Root).Landmark := Landmark;
      --  No street inset yet at this point (cityLayout.ts:212).
      RX := Long_Float (GX) * Cell_Pitch + Street_W / 2.0;
      RY := Long_Float (GY) * Cell_Pitch + Street_W / 2.0;
      RW := Long_Float (SX) * Cell_Pitch - Street_W;
      RH := Long_Float (SY) * Cell_Pitch - Street_W;
      CX := RX + RW / 2.0;
      CY := RY + RH / 2.0;
      C.Blocks (Root).Center_X := To_Units (CX);
      C.Blocks (Root).Center_Y := To_Units (CY);
      Done := True;
      if Use_As = Park then
         C.Blocks (Root).Area := Residential;
      elsif Use_As = Civic_Site then
         if Landmark not in T_Docks | T_Railroad then
            C.Blocks (Root).Area := Civic;
         end if;
         Width := Long_Float'Min (RW * 0.7, (if Landmark = T_Church then 21.0 else 36.0));
         Height := Long_Float'Min (RH * 0.65, (if Landmark = T_Church then 38.0 else 30.0));
         --  The building comes with the others (citygen.ts:470).
         Add_Lot (C, Root, 1, CX - Width / 2.0, CY - Height / 2.0, Width, Height, South, Lot);
      end if;
   end Reserve;

   --  cityLayout.ts:230-235: shuffle the free blocks that fit, then take
   --  the first one whose whole site is still free.
   procedure Find
     (C : in out City_State; Main : in out Hood.Random.Mulberry;
      SX, SY : Integer_32; Use_As : Block_Use; Name, Landmark : Integer_32;
      P : Where; Done : out Boolean)
   is
      N : Natural := 0;
   begin
      Done := False;
      for Id in Integer_32 range 0 .. C.Block_Count - 1 loop
         declare
            B : constant Block_Rec := C.Blocks (Id);
         begin
            if not Reserved (Id) and then B.GX > 0 and then B.GY > 0
              and then B.GX + SX < C.W and then B.GY + SY < C.H and then Holds (C, B, P)
            then
               N := N + 1;
               Cand (N) := Id;
            end if;
         end;
      end loop;
      Hood.Random.Shuffle (Main, Cand (1 .. N));
      for K in 1 .. N loop
         Reserve (C, C.Blocks (Cand (K)).GX, C.Blocks (Cand (K)).GY, SX, SY,
                  Use_As, Name, Landmark, Done);
         exit when Done;
      end loop;
   end Find;

   --  Name numbers (proposed): parks as the Standard city numbers them,
   --  churches 0 and 1.
   Volstead_Green : constant := 0;
   Hinge_Oak      : constant := 1;
   Cinder_Gardens : constant := 3;

   procedure Lay_Out (C : in out City_State; Main : in out Hood.Random.Mulberry) is
      Done, Horizontal : Boolean;
   begin
      Find (C, Main, 2, 2, Park, Volstead_Green, No_Id, Not_Industrial, Done);
      Find (C, Main, 1, 2, Park, Cinder_Gardens, No_Id, Anywhere, Done);
      if C.W >= 12 then
         Find (C, Main, 2, 1, Park, Hinge_Oak, No_Id, Anywhere, Done);
      end if;
      Find (C, Main, 1, 2, Civic_Site, 0, T_Church, Anywhere, Done);
      Find (C, Main, 1, 1, Civic_Site, No_Id, T_City_Hall, Civic_Or_Downtown, Done);
      Find (C, Main, 1, 1, Civic_Site, No_Id, T_Courthouse, Anywhere, Done);
      Find (C, Main, 2, 1, Civic_Site, No_Id, T_Hospital, Anywhere, Done);
      Find (C, Main, 1, 1, Civic_Site, No_Id, T_Police_Hq, Anywhere, Done);
      if Integer_32'Min (C.W, C.H) >= 14 then  --  churchCountForSize = 2
         Find (C, Main, 1, 1, Civic_Site, 1, T_Church, Anywhere, Done);
      end if;
      Find (C, Main, 2, 1, Civic_Site, No_Id, T_Railroad, Industrial_Only, Done);
      if not Done then
         Find (C, Main, 1, 2, Civic_Site, No_Id, T_Railroad, Industrial_Only, Done);
      end if;
      Find (C, Main, 1, 2, Civic_Site, No_Id, T_Docks, Industrial_Only, Done);
      if not Done then
         Find (C, Main, 2, 1, Civic_Site, No_Id, T_Docks, Industrial_Only, Done);
      end if;
      --  Math.floor (blocks * .13) equals (13 * blocks) / 100 for every
      --  block count up to the cap (checked one by one).
      for I in Integer_32 range 1 .. 13 * C.Block_Count / 100 loop
         Hood.Random.Chance (Main, 3, 5, Horizontal);
         Find (C, Main, (if Horizontal then 2 else 1), (if Horizontal then 1 else 2),
               Urban, No_Id, No_Id, Anywhere, Done);
      end loop;
   end Lay_Out;

   --  blockModules.ts:140-147
   procedure Choose_Module (C : in out City_State; Id : Integer_32; Seed : Unsigned_32) is
      B    : Block_Rec renames C.Blocks (Id);
      Long : constant Boolean := Integer_32'Max (B.Span_X, B.Span_Y) > 1;
   begin
      if Long then
         B.Module := (case B.Area is
                         when Industrial  => M_Works_Row_V1,
                         when Residential => M_Terrace_Row_V1,
                         when others      => M_Shopping_Row_V2);
      else
         case B.Area is
            when Industrial =>
               B.Module := M_Works_Court_V1;
            when Downtown | Civic =>
               B.Module := M_Mercantile_Court_V2;
            when Residential =>
               B.Module := (if Rint (Id, Seed + 832, 4) = 0 then M_Terrace_Court_V1
                            else M_Residential_Row_V1);
            when Commercial =>
               B.Module := M_Corner_Shops_V2;
         end case;
      end if;
      B.Turn := (if Long and then B.Span_Y > B.Span_X then 1 else 0)
        + 2 * Rint (Id, Seed + 831, 2);
   end Choose_Module;

   --  blockModules.ts:149-162: a plot turned by quarter turns in its module.
   procedure Turn_Point (M, Turn, X, Y : Integer_32; PX, PY : out Integer_32) is
   begin
      case Turn is
         when 1 =>
            PX := Module_Depth (M) - Y;
            PY := X;
         when 2 =>
            PX := Module_Width (M) - X;
            PY := Module_Depth (M) - Y;
         when 3 =>
            PX := Y;
            PY := Module_Width (M) - X;
         when others =>
            PX := X;
            PY := Y;
      end case;
   end Turn_Point;

   procedure Module_Lots (C : in out City_State; Id : Integer_32) is
      B  : constant Block_Rec := C.Blocks (Id);
      OX : constant Long_Float :=
        Long_Float (B.GX) * Cell_Pitch + Street_W / 2.0 + Long_Float (Inset);
      OY : constant Long_Float :=
        Long_Float (B.GY) * Cell_Pitch + Street_W / 2.0 + Long_Float (Inset);
      AX, AY, BX, BY, Lot : Integer_32;
   begin
      for K in Plot_First (B.Module) .. Plot_First (B.Module) + Plot_Count (B.Module) - 1 loop
         declare
            PL : constant Plot := Plots (K);
         begin
            Turn_Point (B.Module, B.Turn, PL.X, PL.Y, AX, AY);
            Turn_Point (B.Module, B.Turn, PL.X + PL.W, PL.Y + PL.H, BX, BY);
            Add_Lot (C, Id, PL.Index,
                     OX + Long_Float (Integer_32'Min (AX, BX)),
                     OY + Long_Float (Integer_32'Min (AY, BY)),
                     Long_Float (abs (BX - AX)), Long_Float (abs (BY - AY)),
                     Facing'Val ((Facing'Pos (PL.Face) + Integer (B.Turn)) mod 4), Lot);
         end;
      end loop;
   end Module_Lots;

   --  The plot of a module lot (blockModules: plots.find by index).
   function Slot_Of (M, Index : Integer_32) return Integer_32 is
   begin
      for K in Plot_First (M) .. Plot_First (M) + Plot_Count (M) - 1 loop
         if Plots (K).Index = Index then
            return K;
         end if;
      end loop;
      return No_Id;
   end Slot_Of;

   --  citygen.ts:59-66: one plot in four of a shop, office or works module
   --  plays another trade, chosen by a hash of the lot id (1.2.91 numbers
   --  lots from 1 in creation order, here Lot + 1).
   function Trade_For
     (Use_Kind : Plot_Use; Area : District; Lot : Integer_32; Seed : Unsigned_32)
      return Integer_32
   is
      H : constant Unsigned_32 :=
        ((Unsigned_32 (Lot + 1) + 1) xor (Seed * 16#9E37_79B1#)) * 16#85EB_CA6B#;
      Rich : constant Boolean := Area in Downtown | Civic;
      N, Pick : Unsigned_32 := 0;
   begin
      if Use_Kind = Homes or else H mod 4 /= 0 then
         return No_Id;
      end if;
      for T in Trade_Id loop
         if Trade_Family (T) = Use_Kind
           and then (Use_Kind /= Shops or else Rich or else not Trade_Upmarket (T))
         then
            N := N + 1;
         end if;
      end loop;
      if N = 0 then
         return No_Id;
      end if;
      Pick := (H / 4) mod N;
      for T in Trade_Id loop
         if Trade_Family (T) = Use_Kind
           and then (Use_Kind /= Shops or else Rich or else not Trade_Upmarket (T))
         then
            if Pick = 0 then
               return Trade_Type (T);
            end if;
            Pick := Pick - 1;
         end if;
      end loop;
      return No_Id;
   end Trade_For;

   Excluded : constant array (Listed_Type) of Boolean :=
     [T_Church | T_Hospital | T_City_Hall | T_Courthouse | T_Police_Hq
        | T_Docks | T_Railroad => True, others => False];

   --  citygen.ts:174-182 with varied = true.
   procedure Pick_Type
     (Main : in out Hood.Random.Mulberry; Area : District; T : out Type_Id)
   is
      N : Natural := 0;
      I : Positive;
   begin
      for K in Listed_Type loop
         if not Excluded (K) and then Type_Weight (K) (Area) > 0 then
            N := N + 1;
            Choices (N) := K;
            Weights (N) := Type_Weight (K) (Area);
         end if;
      end loop;
      if N = 0 then
         T := T_Tenement_Poor;
      else
         Hood.Random.Weighted (Main, Weights (1 .. N), I);
         T := Choices (I);
      end if;
   end Pick_Type;

   --  A module plot: the family's types suited to the district, else all of
   --  them with a missing weight counting 1 (citygen.ts:477-482).
   procedure Family_Pick
     (Main : in out Hood.Random.Mulberry; Use_Kind : Plot_Use; Area : District;
      T : out Type_Id)
   is
      F0 : constant Integer_32 := Family_First (Use_Kind);
      N  : Natural := 0;
      I  : Positive;
      W  : Integer_32;
   begin
      for K in F0 .. F0 + Family_Length (Use_Kind) - 1 loop
         if Type_Weight (Family_Types (K)) (Area) > 0 then
            N := N + 1;
            Choices (N) := Family_Types (K);
            Weights (N) := Type_Weight (Family_Types (K)) (Area);
         end if;
      end loop;
      if N = 0 then
         for K in F0 .. F0 + Family_Length (Use_Kind) - 1 loop
            W := Type_Weight (Family_Types (K)) (Area);
            N := N + 1;
            Choices (N) := Family_Types (K);
            Weights (N) := (if W = No_Weight then 1 else W);
         end loop;
      end if;
      Hood.Random.Weighted (Main, Weights (1 .. N), I);
      T := Choices (I);
   end Family_Pick;

   --  citygen.ts:497-510: a landmark goes to a site reserved for it, else
   --  to a random free plot of a random block that suits it.
   procedure Place_Special
     (C : in out City_State; Main : in out Hood.Random.Mulberry;
      T : Listed_Type; P : Where)
   is
      N, M  : Natural := 0;
      Pick, Lot, B : Integer_32;
      function Free_Lots (Id : Integer_32) return Natural is
         Count : Natural := 0;
      begin
         for L in C.Blocks (Id).First_Lot .. C.Blocks (Id).First_Lot + C.Blocks (Id).Lots - 1 loop
            if C.Lots (L).Index /= Centre and then not Placed (C.Lots (L).Building) then
               Count := Count + 1;
            end if;
         end loop;
         return Count;
      end Free_Lots;
   begin
      for K in Integer_32 range 0 .. C.Building_Count - 1 loop
         if not C.Buildings (K).Removed and then not Placed (K)
           and then C.Buildings (K).Kind_Of = T
           and then C.Blocks (C.Buildings (K).Block).Landmark = T
         then
            Placed (K) := True;
            return;
         end if;
      end loop;
      for Id in Integer_32 range 0 .. C.Block_Count - 1 loop
         if Holds (C, C.Blocks (Id), P) and then C.Blocks (Id).Lots > 1
           and then C.Blocks (Id).Use_Of /= Civic_Site and then Free_Lots (Id) > 0
         then
            N := N + 1;
            Cand (N) := Id;
         end if;
      end loop;
      if N = 0 then
         return;
      end if;
      Hood.Random.Pick_Index (Main, Integer_32 (N), Pick);
      declare
         Id : constant Integer_32 := Cand (Positive (Pick + 1));
      begin
         for L in C.Blocks (Id).First_Lot .. C.Blocks (Id).First_Lot + C.Blocks (Id).Lots - 1 loop
            if C.Lots (L).Index /= Centre and then not Placed (C.Lots (L).Building) then
               M := M + 1;
               Avail (M) := L;
            end if;
         end loop;
      end;
      Hood.Random.Pick_Index (Main, Integer_32 (M), Pick);
      Lot := Avail (Positive (Pick + 1));
      Replace_Building (C, Lot, T, B);
      if B /= No_Id then
         Placed (B) := True;
      end if;
   end Place_Special;

   procedure Build
     (C    : in out City_State;
      Main : in out Hood.Random.Mulberry;
      Seed : Unsigned_32)
   is
      Id, B : Integer_32;
      Area  : District;
      T     : Type_Id;
      Trade, Slot : Integer_32;
   begin
      --  Blocks (citygen.ts:417-441).
      for GY in Integer_32 range 0 .. C.H - 1 loop
         for GX in Integer_32 range 0 .. C.W - 1 loop
            Id := GY * C.W + GX;
            Area := District_For (GX, GY, C.W, C.H, C.Industrial_Edge);
            C.Blocks (Id) :=
              (GX => GX, GY => GY, Area => Area, Land_Value => 0, Squalor => 0,
               Use_Of => Urban, Span_X => 1, Span_Y => 1, Merged_Into => No_Id,
               Content => No_Id, Plan_Value => 0, Rail => False,
               Landmark => No_Id, Name => No_Id, Module => No_Id, Turn => 0,
               Center_X => To_Units (Long_Float (GX) * Cell_Pitch + Cell_Pitch / 2.0),
               Center_Y => To_Units (Long_Float (GY) * Cell_Pitch + Cell_Pitch / 2.0),
               First_Lot => 0, Lots => 0);
            case Area is
               when Downtown    => Hood.Random.Int (Main, 72, 96, C.Blocks (Id).Land_Value);
               when Civic       => Hood.Random.Int (Main, 52, 74, C.Blocks (Id).Land_Value);
               when Commercial  => Hood.Random.Int (Main, 38, 66, C.Blocks (Id).Land_Value);
               when Industrial  => Hood.Random.Int (Main, 22, 48, C.Blocks (Id).Land_Value);
               when Residential => Hood.Random.Int (Main, 16, 44, C.Blocks (Id).Land_Value);
            end case;
            case Area is
               when Residential => Hood.Random.Int (Main, 30, 70, C.Blocks (Id).Squalor);
               when Industrial  => Hood.Random.Int (Main, 28, 60, C.Blocks (Id).Squalor);
               when others      => Hood.Random.Int (Main, 5, 34, C.Blocks (Id).Squalor);
            end case;
            Reserved (Id) := False;
         end loop;
      end loop;
      C.Block_Count := C.W * C.H;

      --  Reserved sites, then a module on every other urban block
      --  (cityLayout.ts:236-285). Trams: step 6.
      Lay_Out (C, Main);
      for K in Integer_32 range 0 .. C.Block_Count - 1 loop
         if C.Blocks (K).Merged_Into = No_Id and then C.Blocks (K).Use_Of = Urban then
            Choose_Module (C, K, Seed);
            Module_Lots (C, K);
         end if;
      end loop;

      --  Buildings (citygen.ts:470-488).
      for K in Integer_32 range 0 .. C.Block_Count - 1 loop
         for L in C.Blocks (K).First_Lot .. C.Blocks (K).First_Lot + C.Blocks (K).Lots - 1 loop
            declare
               BR : constant Block_Rec := C.Blocks (K);
               LR : constant Lot_Rec := C.Lots (L);
            begin
               if LR.Index = Centre then
                  Add_Building (C, L, Empty_Land, No_Kind, B);
               else
                  Slot := (if BR.Module = No_Id then No_Id else Slot_Of (BR.Module, LR.Index));
                  if BR.Landmark /= No_Id then
                     T := BR.Landmark;
                  elsif Slot /= No_Id then
                     Family_Pick (Main, Plots (Slot).Use_Kind, BR.Area, T);
                  else
                     Pick_Type (Main, BR.Area, T);
                  end if;
                  Trade := No_Id;
                  if Slot /= No_Id and then BR.Landmark = No_Id
                    and then not Plots (Slot).Vacant
                    and then not Type_Recruits (T) and then not Type_Special (T)
                    and then Type_Class (T) in Commercial | Industrial
                    and then T /= T_Warehouse
                  then
                     Trade := Trade_For (Plots (Slot).Use_Kind, BR.Area, L, Seed);
                  end if;
                  if Slot /= No_Id and then Plots (Slot).Vacant then
                     T := Empty_Land;
                  elsif Trade /= No_Id then
                     T := Trade;
                  end if;
                  Add_Building (C, L, T, No_Kind, B);
               end if;
            end;
         end loop;
      end loop;

      --  Landmarks (citygen.ts:511-536).
      for K in Integer_32 range 0 .. Max_Buildings - 1 loop
         Placed (K) := False;
      end loop;
      Place_Special (C, Main, T_City_Hall, Civic_Only);
      Place_Special (C, Main, T_Courthouse, Civic_Only);
      Place_Special (C, Main, T_Police_Hq, Civic_Only);
      Place_Special (C, Main, T_Hospital, Civic_Or_Commercial);
      Place_Special (C, Main, T_Newspaper, Corner_1);
      Place_Special (C, Main, T_Newspaper, Corner_2);
      Place_Special (C, Main, T_Newspaper, Corner_3);
      Place_Special (C, Main, T_Newspaper, Corner_4);
      Place_Special (C, Main, T_Docks, Industrial_Only);
      Place_Special (C, Main, T_Railroad, Industrial_Only);
      for I in Integer_32 range 1 .. (if Integer_32'Min (C.W, C.H) >= 14 then 2 else 1) loop
         Place_Special (C, Main, T_Church, Residential_Or_Civic);
      end loop;
      Place_Special (C, Main, T_Orphanage, Residential_Only);
      Place_Special (C, Main, T_Labour_Exchange, Industrial_Or_Civic);
      for I in Integer_32 range 1 .. 3 loop
         Place_Special (C, Main, T_Trade_Union, Industrial_Only);
      end loop;
      Place_Special (C, Main, T_Bank_Large, Downtown_Only);
      for I in Integer_32 range 1 .. 5 loop
         Place_Special (C, Main, T_Gym, Not_Downtown);
      end loop;
      for I in Integer_32 range 1 .. 5 loop
         Place_Special (C, Main, T_Pool_Hall, Not_Downtown);
      end loop;
      for I in Integer_32 range 1 .. 3 loop
         Place_Special (C, Main, T_Accountancy, Downtown_Or_Civic);
      end loop;
      for I in Integer_32 range 1 .. 3 loop
         Place_Special (C, Main, T_Law_Firm, Downtown_Or_Civic);
      end loop;
      for I in Integer_32 range 1 .. 3 loop
         Place_Special (C, Main, T_Warehouse, Industrial_Only);
      end loop;
   end Build;

end Hood.City.Varied;
